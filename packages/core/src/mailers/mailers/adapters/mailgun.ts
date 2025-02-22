import { env } from '@latitude-data/env'
import nodemailer, { SentMessageInfo, Transport } from 'nodemailer'
import mg from 'nodemailer-mailgun-transport'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { MailerOptions } from '.'

export type MailgunResponse = {
  status: number
  message: string
  messageId: string
}
export default function createMailgunTransport({
  transportOptions,
}: MailerOptions) {
  const domain = env.MAILGUN_EMAIL_DOMAIN
  const apiKey = env.MAILGUN_MAILER_API_KEY

  if (!domain || !apiKey) return null

  const transport = mg({
    host: env.MAILGUN_HOST,
    protocol: env.MAILGUN_PROTOCOL,
    port: 443,
    auth: { domain, apiKey },
  }) as Transport<SentMessageInfo>
  return nodemailer.createTransport<SMTPTransport.SentMessageInfo>(
    transport,
    transportOptions,
  )
}
