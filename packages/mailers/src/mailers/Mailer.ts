import { Result, TypedResult } from '@latitude-data/core/lib/Result'
import { env } from '@latitude-data/env'
import { SentMessageInfo, Transporter } from 'nodemailer'
import Mail, { Address } from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import adapter from './adapters'

export default abstract class Mailer {
  protected options: Mail.Options

  private adapter: Transporter<SMTPTransport.SentMessageInfo> = adapter

  public static get adapterOptions(): Mail.Options {
    return adapter.options
  }

  static get from(): string {
    return env.FROM_MAILER_EMAIL
  }

  static get fromString(): string {
    return `Latitude <${Mailer.from}>`
  }

  constructor(options: Mail.Options) {
    this.options = options
  }

  abstract send(
    _options: Mail.Options,
    _attrs: unknown,
  ): Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>>

  protected async sendMail(
    options: Mail.Options,
  ): Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>> {
    let result
    try {
      result = await this.adapter.sendMail({
        to: options.to,
        from: options.from || Mailer.from,
        subject: options.subject,
        html: options.html,
      })
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
