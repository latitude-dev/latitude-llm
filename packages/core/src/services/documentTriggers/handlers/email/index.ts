import { findUnscopedDocumentTriggers } from '../../find'
import {
  DocumentTriggerType,
  EMAIL_TRIGGER_DOMAIN,
} from '@latitude-data/constants'
import { database } from '../../../../client'
import { DocumentTrigger, HEAD_COMMIT, Workspace } from '../../../../browser'
import { DocumentVersionsRepository } from '../../../../repositories'
import { EmailTriggerConfiguration } from '../../helpers/schema'
import { PromptLFile } from 'promptl-ai'
import { uploadFile } from '../../../files'
import { unsafelyFindWorkspace } from '../../../../data-access'
import { RunEmailTriggerJobData } from '../../../../jobs/job-definitions/documentTriggers/runEmailTriggerJob'
import { defaultQueue } from '../../../../jobs/queues'
import { BadRequestError } from './../../../../lib/errors'
import { LatitudeError } from './../../../../lib/errors'
import { PromisedResult } from './../../../../lib/Transaction'
import { Result } from './../../../../lib/Result'

async function getTriggerName(
  trigger: DocumentTrigger,
  db = database,
): PromisedResult<string, Error> {
  const configName = (
    trigger.configuration as EmailTriggerConfiguration
  ).name?.trim()
  if (configName?.length) {
    return Result.ok(configName)
  }

  const docsScope = new DocumentVersionsRepository(trigger.workspaceId, db)
  const documentResult = await docsScope.getDocumentAtCommit({
    projectId: trigger.projectId,
    commitUuid: HEAD_COMMIT,
    documentUuid: trigger.documentUuid,
  })
  if (documentResult.error) return documentResult

  const document = documentResult.unwrap()
  const docName = document.path.split('/').pop()!
  return Result.ok(docName)
}

export async function assertTriggerFilters({
  sender,
  trigger,
}: {
  sender: string
  trigger: DocumentTrigger
}): PromisedResult<undefined> {
  const configuration = trigger.configuration as EmailTriggerConfiguration
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

export async function uploadAttachments({
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

export async function handleEmailTrigger(
  {
    recipient,
    senderEmail,
    senderName,
    subject,
    body,
    messageId,
    parentMessageIds,
    attachments,
  }: {
    recipient: string
    senderEmail: string
    senderName: string | undefined
    subject: string
    body: string
    messageId?: string
    parentMessageIds?: string[]
    attachments?: File[]
  },
  db = database,
): PromisedResult<undefined> {
  const [documentUuid, domain] = recipient.split('@')
  if (domain !== EMAIL_TRIGGER_DOMAIN) {
    return Result.nil()
  }

  const trigger = await findUnscopedDocumentTriggers(
    {
      documentUuid: documentUuid!,
      triggerType: DocumentTriggerType.Email,
    },
    db,
  ).then((r) => r[0])

  if (!trigger) return Result.nil()

  const assertFilterResult = await assertTriggerFilters({
    sender: senderEmail,
    trigger,
  })
  if (assertFilterResult.error) return assertFilterResult

  const workspace = (await unsafelyFindWorkspace(
    trigger.workspaceId,
    db,
  )) as Workspace

  const nameResult = await getTriggerName(trigger, db)
  if (nameResult.error) return nameResult

  const uploadResult = await uploadAttachments({
    workspace,
    attachments: attachments ?? [],
  })
  if (uploadResult.error) return uploadResult
  const uploadedFiles = uploadResult.unwrap()

  const runJobData: RunEmailTriggerJobData = {
    workspaceId: workspace.id,
    triggerId: trigger.id,
    recipient: recipient,
    senderEmail: senderEmail,
    senderName: senderName,
    messageId: messageId,
    parentMessageIds: parentMessageIds,
    subject: subject,
    body: body,
    attachments: uploadedFiles,
  }

  const job = await defaultQueue.add('runEmailTriggerJob', runJobData)
  if (!job.id) {
    return Result.error(new LatitudeError('Failed to enqueue job'))
  }

  return Result.nil()
}
