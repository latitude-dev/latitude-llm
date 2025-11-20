import { env } from '@latitude-data/env'
import { SentMessageInfo, Transporter } from 'nodemailer'
import Mail, { Address } from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { Result, TypedResult } from '../../lib/Result'
import { createAdapter } from './adapters'

/**
 * Batch sending options for Mailgun.
 * https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/batch-sending
 */
export type ExtendedMailOptions = Mail.Options & {
  'recipient-variables'?: Record<string, Record<string, unknown>>
}

/**
 * Safely stringify recipient variables for Mailgun.
 * https://github.com/mailgun/mailgun.js/issues/7#issuecomment-193629734
 */
function safeRecipientVariables(options: ExtendedMailOptions): string {
  const recipientVariables = options['recipient-variables']
  if (!recipientVariables) return ''

  return JSON.stringify(recipientVariables)
}

export default abstract class Mailer {
  protected options: Mail.Options

  private adapter: Transporter<SMTPTransport.SentMessageInfo>

  static get from(): string {
    return `Latitude <${env.FROM_MAILER_EMAIL}>`
  }

  constructor(options: Mail.Options, adapter = createAdapter()) {
    this.options = options
    this.adapter = adapter
  }

  abstract send(
    _options: ExtendedMailOptions,
    _attrs: unknown,
  ): Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>>

  protected async sendMail(
    options: ExtendedMailOptions,
  ): Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>> {
    try {
      // Mailgun accepts extended options including 'recipient-variables' for batch sending.
      // We cast to Mail.Options since nodemailer's Transporter type doesn't support
      // transport-specific extensions, but the Mailgun transport handles this at runtime.
      const mailOptions: Mail.Options = {
        ...options,
        from: options.from || Mailer.from,
        'recipient-variables': safeRecipientVariables(options),
      } as Mail.Options

      const result = await this.adapter.sendMail(mailOptions)
      const info = this.ensureSendMessageInfo(result, options)
      const failed = info.rejected.concat(info.pending).filter(Boolean)

      if (failed.length) {
        return Result.error(
          new Error(`Email(s) (${failed.join(', ')}) could not be sent`),
        )
      }

      return Result.ok(info)
    } catch (error) {
      return Result.error(error as Error)
    }
  }

  private ensureSendMessageInfo(
    input: SentMessageInfo,
    options: Mail.Options,
  ): SMTPTransport.SentMessageInfo {
    if (typeof input === 'object' && input !== null && 'accepted' in input) {
      return input as SMTPTransport.SentMessageInfo
    }

    const response = input?.message as unknown as string
    const emails = this.convertToArray(options.to ?? '')
    const to = emails.map((email) => this.maybeAddressToString(email))
    const from = this.maybeAddressToString(options.from)
    return {
      messageId: input.messageId,
      accepted: input.status === 200 ? emails : [],
      rejected: input.status !== 200 ? emails : [],
      pending: [],
      envelope: { from, to },
      response,
    }
  }

  private convertToArray<T>(value: T | T[]): T[] {
    if (!value) return []

    return Array.isArray(value) ? value : [value]
  }

  private maybeAddressToString(address: string | Address | undefined): string {
    if (!address) return ''

    return typeof address === 'string' ? address : address.address
  }
}
