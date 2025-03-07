import { env } from '@latitude-data/env'
import {
  BadRequestError,
  LatitudeError,
  PromisedResult,
  Result,
} from '../../../lib'
import { findUnscopedDocumentTriggers } from '../find'
import { DocumentTriggerType, LogSources } from '@latitude-data/constants'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../repositories'
import { database } from '../../../client'
import { runDocumentAtCommit } from '../../commits/runDocumentAtCommit'
import { unsafelyFindWorkspace } from '../../../data-access'
import { DocumentTrigger, Workspace } from '../../../browser'
import { DocumentTriggerMailer } from '../../../mailers'
import { AssistantMessage } from '@latitude-data/compiler'

export async function assertTriggerFilters({
  sender,
  trigger,
}: {
  sender: string
  trigger: DocumentTrigger
}): PromisedResult<undefined> {
  if (
    !trigger.configuration.emailWhitelist &&
    !trigger.configuration.domainWhitelist
  ) {
    return Result.nil()
  }

  if (trigger.configuration.emailWhitelist) {
    const whitelist = trigger.configuration.emailWhitelist
    if (whitelist.includes(sender)) return Result.nil()
  }

  if (trigger.configuration.domainWhitelist) {
    const whitelist = trigger.configuration.domainWhitelist
    const domain = sender.split('@')[1]
    if (!domain) return Result.nil()
    if (whitelist.includes(domain)) return Result.nil()
  }

  return Result.error(new BadRequestError('Sender is not in whitelist'))
}

export async function getTriggerResponse(
  {
    trigger,
    subject,
    body,
    sender,
  }: {
    trigger: DocumentTrigger
    sender: string
    subject: string
    body: string
  },
  db = database,
): PromisedResult<AssistantMessage, LatitudeError> {
  const workspace = (await unsafelyFindWorkspace(
    trigger.workspaceId,
    db,
  )) as Workspace

  const commitsScope = new CommitsRepository(trigger.workspaceId, db)
  const headCommitResult = await commitsScope.getHeadCommit(trigger.projectId)
  if (headCommitResult.error) return headCommitResult.error
  const headCommit = headCommitResult.unwrap()

  if (!headCommit) {
    return Result.error(new BadRequestError('No head commit found'))
  }

  const documentsScope = new DocumentVersionsRepository(
    trigger.workspaceId,
    db,
    { includeDeleted: true },
  )
  const docResult = await documentsScope.getDocumentAtCommit({
    documentUuid: trigger.documentUuid,
    commitUuid: headCommit.uuid,
  })
  if (docResult.error) return Result.error(docResult.error)
  const document = docResult.unwrap()

  if (document.deletedAt) {
    return Result.error(new BadRequestError('Document is deleted'))
  }

  const parameters = {
    ...Object.fromEntries(
      trigger.configuration.senderParameters?.map((paramName) => [
        paramName,
        sender,
      ]) ?? [],
    ),
    ...Object.fromEntries(
      trigger.configuration.subjectParameters?.map((paramName) => [
        paramName,
        subject,
      ]) ?? [],
    ),
    ...Object.fromEntries(
      trigger.configuration.contentParameters?.map((paramName) => [
        paramName,
        body,
      ]) ?? [],
    ),
  }

  const runResult = await runDocumentAtCommit({
    workspace,
    document,
    commit: headCommit,
    parameters,
    source: LogSources.EmailTrigger,
  })

  if (runResult.error) return Result.error(runResult.error)
  const run = runResult.unwrap()

  const runError = await run.error
  if (runError) return Result.error(runError)

  const messages = await run.messages

  return Result.ok(messages.at(-1) as AssistantMessage)
}

export async function handleEmailTrigger(
  {
    recipient,
    subject,
    body,
    sender,
  }: {
    sender: string
    recipient: string
    subject: string
    body: string
  },
  db = database,
): PromisedResult<undefined> {
  if (!env.EMAIL_TRIGGER_DOMAIN) {
    return Result.error(new LatitudeError('Email triggers are not enabled'))
  }

  const [documentUuid, domain] = recipient.split('@')
  if (domain !== env.EMAIL_TRIGGER_DOMAIN) {
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
    sender,
    trigger,
  })
  if (assertFilterResult.error) return assertFilterResult

  const responseResult = await getTriggerResponse(
    {
      trigger,
      sender,
      subject,
      body,
    },
    db,
  )

  if (trigger.configuration.replyWithResponse === false) {
    return Result.nil()
  }

  const mailer = new DocumentTriggerMailer(
    {
      to: sender,
      from: recipient,
    },
    {
      subject,
      result: responseResult,
    },
  )

  const sendResult = await mailer.send()
  if (sendResult.error) return sendResult
  return Result.nil()
}
