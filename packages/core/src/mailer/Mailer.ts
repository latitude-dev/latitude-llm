import { env } from '@latitude-data/env'
import { SentMessageInfo, Transporter } from 'nodemailer'
import Mail, { Address } from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { Result, TypedResult } from '../lib/Result'
import { captureException } from '../utils/datadogCapture'
import { createAdapter } from './adapters'
import {
  AddressItem,
  buildBatchRecipients,
  RecipientBatch,
} from './buildBatchRecipients'

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

  constructor(options: Mail.Options = {}, adapter = createAdapter()) {
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

  /**
   * Send emails in batches to multiple recipients.
   * Mailgun supports up to 1000 recipients per batch.
   *
   * @param addresses - Array of recipient objects with userId, email and name
   * @param sendOptions - Function that returns the mail options for each batch
   * @param context - Context for error tracking (mailName and additional metadata)
   * @param batchSize - Number of recipients per batch (default: 100)
   * @returns Array of results for each batch
   */
  async sendInBatches({
    addressList,
    sendOptions,
    context,
    batchSize = 100,
  }: {
    addressList: AddressItem[]
    sendOptions: (
      batch: RecipientBatch,
    ) => Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>>
    context: {
      mailName: string
      [key: string]: unknown
    }
    batchSize?: number
  }) {
    const batches = buildBatchRecipients({ addressList, batchSize })
    const results = await Promise.all(
      batches.map((batch, _i) => sendOptions(batch)),
    )
    return results.map((result, index) => {
      const batchSize = batches[index]!.to.length
      if (Result.isOk(result)) return

      captureException(result.error, {
        ...context,
        batchIndex: index,
        batchSize,
      })
    })
  }
}
