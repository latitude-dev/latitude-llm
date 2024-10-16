import { env } from '@latitude-data/env'
import { type Transporter, type TransportOptions } from 'nodemailer'
import HTMLToText from 'nodemailer-html-to-text'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import createMailgunTransport from './mailgun'
import createMailpitTransport from './mailpit'

const htmlToText = HTMLToText.htmlToText

export type MailerOptions = {
  transportOptions: TransportOptions
}

export type AdapterResult = {
  messageId: string
  status?: number
  message?: string
}

type MaybeTransport = Transporter<SMTPTransport.SentMessageInfo> | null

export function createAdapter() {
  const options = {
    transportOptions: { component: 'latitude_mailer' },
  }

  const isPro = env.NODE_ENV === 'production'

  const transport: MaybeTransport = isPro
    ? createMailgunTransport(options)
    : createMailpitTransport(options)

  if (!transport) throw new Error('Could not create transport')

  // Middleware to convert HTML to text
  transport.use('compile', htmlToText())

  return transport
}
