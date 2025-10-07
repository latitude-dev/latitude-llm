import {
  DocumentTriggerType,
  EMAIL_TRIGGER_DOMAIN,
} from '@latitude-data/constants'
import { PromptLFile } from 'promptl-ai'
import {
  Commit,
  DocumentTrigger,
  DocumentTriggerEvent,
  Workspace,
} from '../../../../schema/types'
import { database } from '../../../../client'
import { unsafelyFindWorkspaceAndProjectFromDocumentUuid } from '../../../../data-access/workspaces'
import { BadRequestError, LatitudeError } from '../../../../lib/errors'
import { Result } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'
import {
  CommitsRepository,
  DocumentTriggersRepository,
} from '../../../../repositories'
import { uploadFile } from '../../../files'
import {
  EmailTriggerConfiguration,
  EmailTriggerEventPayload,
} from '@latitude-data/constants/documentTriggers'
import { registerDocumentTriggerEvent } from '../../triggerEvents/registerEvent'

async function assertTriggerFilters({
  sender,
  configuration,
}: {
  sender: string
  configuration: EmailTriggerConfiguration
}): PromisedResult<undefined> {
  if (!configuration.emailWhitelist && !configuration.domainWhitelist) {
    return Result.nil()
  }

  if (configuration.emailWhitelist) {
    const whitelist = configuration.emailWhitelist
    if (whitelist.includes(sender)) return Result.nil()
  }

  if (configuration.domainWhitelist) {
    const whitelist = configuration.domainWhitelist
    const domain = sender.split('@')[1]
    if (!domain) return Result.nil()
    if (whitelist.includes(domain)) return Result.nil()
  }

  return Result.error(new BadRequestError('Sender is not in whitelist'))
}

async function uploadAttachments({
  workspace,
  attachments,
}: {
  workspace: Workspace
  attachments: File[]
}): PromisedResult<PromptLFile[], LatitudeError> {
  const results = await Promise.all(
    attachments.map(async (file) => {
      return await uploadFile({ file, workspace })
    }),
  )

  const errors = results.filter((result) => result.error)
  if (errors.length) {
    return Result.error(errors[0]!.error! as LatitudeError)
  }

  return Result.ok(results.map((result) => result.unwrap()))
}

export async function registerEmailTriggerEvent(
  {
    recipient,
    senderEmail,
    senderName,
    subject,
    body,
    messageId,
    parentMessageIds,
    attachments,
    commit,
  }: {
    recipient: string
    senderEmail: string
    senderName: string | undefined
    subject: string
    body: string
    messageId?: string
    parentMessageIds?: string[]
    attachments?: File[]
    commit?: Commit // Only used in development to test draft
  },
  db = database,
): PromisedResult<DocumentTriggerEvent | undefined> {
  const [documentUuid, domain] = recipient.split('@') as [string, ...string[]]
  if (domain !== EMAIL_TRIGGER_DOMAIN) {
    // Filter out wrong domains
    return Result.nil()
  }

  const findResult = await unsafelyFindWorkspaceAndProjectFromDocumentUuid(
    documentUuid,
    db,
  )
  if (findResult.error) return Result.nil() // Filter out emails without existing destination
  const { workspace, project } = findResult.unwrap()

  const documentTriggerScope = new DocumentTriggersRepository(workspace.id, db)

  const documentTriggersResult =
    await documentTriggerScope.getTriggersInDocument({
      documentUuid,
      commit,
    })

  if (documentTriggersResult.error) return Result.nil()
  const documentTriggers = documentTriggersResult.unwrap()
  const emailTriggers = documentTriggers.filter(
    (trigger) => trigger.triggerType === DocumentTriggerType.Email,
  ) as DocumentTrigger<DocumentTriggerType.Email>[]

  if (!emailTriggers.length) return Result.nil() // No need for further processing

  const uploadResult = await uploadAttachments({
    workspace,
    attachments: attachments ?? [],
  })
  if (uploadResult.error) return uploadResult
  const uploadedFiles = uploadResult.unwrap()

  const commitsScope = new CommitsRepository(workspace.id, db)
  const headCommit = await commitsScope.getHeadCommit(project.id)

  // TODO: Search the Live and all draft versions for each trigger, not just the Live one
  if (!headCommit) return Result.nil()

  const eventPayload: EmailTriggerEventPayload = {
    recipient,
    senderEmail,
    senderName,
    subject,
    body,
    messageId,
    parentMessageIds,
    attachments: uploadedFiles,
  }

  for await (const trigger of emailTriggers) {
    const assertFilterResult = await assertTriggerFilters({
      sender: senderEmail,
      configuration: trigger.configuration,
    })
    if (assertFilterResult.error) return assertFilterResult

    const result = await registerDocumentTriggerEvent({
      workspace,
      triggerUuid: trigger.uuid,
      commit: commit ?? headCommit,
      eventPayload,
    })

    if (!Result.isOk(result)) return result
  }

  return Result.nil()
}
