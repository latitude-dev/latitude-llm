import {
  DocumentTriggerType,
  EMAIL_TRIGGER_DOMAIN,
} from '@latitude-data/constants'
import { type Commit } from '../../../../schema/models/types/Commit'
import { type DocumentTrigger } from '../../../../schema/models/types/DocumentTrigger'
import { type DocumentTriggerEvent } from '../../../../schema/models/types/DocumentTriggerEvent'
import { DocumentTriggerMailer } from '../../../../mailer/mailers/documentEmailTrigger/DocumentTriggerMailer'
import type { AssistantMessage } from '@latitude-data/constants/messages'
import { Result, TypedResult } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../../repositories'

async function getTriggerName({
  documentTrigger,
  commit,
}: {
  documentTrigger: DocumentTrigger<DocumentTriggerType.Email>
  commit: Commit
}): PromisedResult<string, Error> {
  const configName = documentTrigger.configuration.name?.trim()
  if (configName?.length) {
    return Result.ok(configName)
  }

  const docsScope = new DocumentVersionsRepository(documentTrigger.workspaceId)
  const documentResult = await docsScope.getDocumentAtCommit({
    projectId: documentTrigger.projectId,
    commitUuid: commit.uuid,
    documentUuid: documentTrigger.documentUuid,
  })
  if (documentResult.error) return documentResult

  const document = documentResult.unwrap()
  const docName = document.path.split('/').pop()!
  return Result.ok(docName)
}

export async function sendEmailResponse({
  documentTrigger,
  documentTriggerEvent,
  result,
}: {
  documentTrigger: DocumentTrigger<DocumentTriggerType.Email>
  documentTriggerEvent: DocumentTriggerEvent<DocumentTriggerType.Email>
  result: TypedResult<AssistantMessage, Error>
}) {
  const commitsScope = new CommitsRepository(documentTrigger.workspaceId)
  const commitResult = await commitsScope.find(documentTrigger.commitId)
  if (!Result.isOk(commitResult)) return commitResult
  const commit = commitResult.unwrap()

  const nameResult = await getTriggerName({ documentTrigger, commit })
  if (!Result.isOk(nameResult)) return nameResult
  const name = nameResult.unwrap()

  if (documentTrigger.configuration.replyWithResponse === false) {
    return Result.nil()
  }

  const { parentMessageIds, messageId, senderEmail, subject } =
    documentTriggerEvent.payload

  const from = `${JSON.stringify(name)} <${documentTrigger.documentUuid}@${EMAIL_TRIGGER_DOMAIN}>`

  const references = [
    ...(parentMessageIds ?? []),
    ...(messageId ? [messageId] : []),
  ].join(' ')

  const headers = documentTriggerEvent.payload.messageId
    ? {
        'In-Reply-To': messageId!,
        References: references,
        // It seems like nodemailer-mailgun-transport is ignoring the "References" header.
        // Maybe some of these will work:
        'X-Mailgun-References': references,
        'h:References': references,
        'h:X-Mailgun-References': references,
      }
    : undefined

  const mailer = new DocumentTriggerMailer(result, {
    to: senderEmail,
    from,
    inReplyTo: messageId,
    references,
    subject: 'Re: ' + subject,
    headers,
  })

  const sendResult = await mailer.send()
  if (!Result.isOk(sendResult)) return sendResult

  return Result.nil()
}
