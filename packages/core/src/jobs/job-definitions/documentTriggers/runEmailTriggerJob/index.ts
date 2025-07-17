import { EMAIL_TRIGGER_DOMAIN } from '@latitude-data/constants'
import { Job } from 'bullmq'
import { PromptLFile } from 'promptl-ai'
import { DocumentTrigger, HEAD_COMMIT, Workspace } from '../../../../browser'
import { unsafelyFindWorkspace } from '../../../../data-access'
import { Result } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'
import { DocumentTriggerMailer } from '../../../../mailers'
import {
  DocumentTriggersRepository,
  DocumentVersionsRepository,
} from '../../../../repositories'
import { EmailTriggerConfiguration } from '../../../../services/documentTriggers/helpers/schema'
import { getEmailResponse } from './getResponse'

export type RunEmailTriggerJobData = {
  workspaceId: number
  triggerId: number
  recipient: string
  senderEmail: string
  senderName: string | undefined
  messageId?: string
  parentMessageIds?: string[]
  subject: string
  body: string
  attachments: PromptLFile[]
}

async function getTriggerName(
  trigger: DocumentTrigger,
): PromisedResult<string, Error> {
  const configName = (
    trigger.configuration as EmailTriggerConfiguration
  ).name?.trim()
  if (configName?.length) {
    return Result.ok(configName)
  }

  const docsScope = new DocumentVersionsRepository(trigger.workspaceId)
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

export const runEmailTriggerJob = async (job: Job<RunEmailTriggerJobData>) => {
  const {
    workspaceId,
    triggerId,
    senderEmail,
    senderName,
    messageId,
    parentMessageIds,
    subject,
    body,
    attachments,
  } = job.data

  const workspace = (await unsafelyFindWorkspace(workspaceId)) as Workspace

  const triggerScope = new DocumentTriggersRepository(workspace.id)
  const triggerResult = await triggerScope.find(triggerId)
  const trigger = triggerResult.unwrap()

  const nameResult = await getTriggerName(trigger)
  const name = nameResult.unwrap()

  const responseResult = await getEmailResponse({
    documentUuid: trigger.documentUuid,
    trigger,
    messageId,
    parentMessageIds,
    senderEmail,
    senderName,
    subject,
    body,
    attachments,
  })

  const configuration = trigger.configuration as EmailTriggerConfiguration
  if (configuration.replyWithResponse === false) {
    return
  }

  const from = `${JSON.stringify(name)} <${trigger.documentUuid}@${EMAIL_TRIGGER_DOMAIN}>`

  const references = [
    ...(parentMessageIds ?? []),
    ...(messageId ? [messageId] : []),
  ].join(' ')

  const headers = messageId
    ? {
        'In-Reply-To': messageId,
        References: references,
        // It seems like nodemailer-mailgun-transport is ignoring the "References" header.
        // Maybe some of these will work:
        'X-Mailgun-References': references,
        'h:References': references,
        'h:X-Mailgun-References': references,
      }
    : undefined

  const mailer = new DocumentTriggerMailer(responseResult, {
    to: senderEmail,
    from,
    inReplyTo: messageId,
    references,
    subject: 'Re: ' + subject,
    headers,
  })

  const result = await mailer.send()
  result.unwrap()
}
