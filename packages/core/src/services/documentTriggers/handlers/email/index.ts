import { BadRequestError, PromisedResult, Result } from '../../../../lib'
import { findUnscopedDocumentTriggers } from '../../find'
import {
  DocumentTriggerType,
  EMAIL_TRIGGER_DOMAIN,
} from '@latitude-data/constants'
import { database } from '../../../../client'
import { DocumentTrigger } from '../../../../browser'
import { DocumentTriggerMailer } from '../../../../mailers'
import { getEmailResponse } from './getResponse'

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

export async function handleEmailTrigger(
  {
    recipient,
    senderEmail,
    senderName,
    subject,
    body,
    messageId,
    parentMessageIds,
  }: {
    recipient: string
    senderEmail: string
    senderName: string | undefined
    subject: string
    body: string
    messageId?: string
    parentMessageIds?: string[]
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

  const responseResult = await getEmailResponse(
    {
      documentUuid: documentUuid!,
      trigger,
      messageId,
      parentMessageIds,
      senderEmail,
      senderName,
      subject,
      body,
    },
    db,
  )

  if (trigger.configuration.replyWithResponse === false) {
    return Result.nil()
  }

  const replyHeaders = messageId
    ? { inReplyTo: messageId, references: parentMessageIds ?? [messageId] }
    : {}

  const mailer = new DocumentTriggerMailer(
    {
      to: senderEmail,
      from: recipient,
      ...replyHeaders,
    },
    {
      subject: 'Re: ' + subject,
      result: responseResult,
    },
  )

  const sendResult = await mailer.send()
  if (sendResult.error) return sendResult
  return Result.nil()
}
