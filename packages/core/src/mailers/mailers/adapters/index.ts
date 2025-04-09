import { env } from '@latitude-data/env'
import { type Transporter, type TransportOptions } from 'nodemailer'
import HTMLToText from 'nodemailer-html-to-text'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import createMailgunTransport from './mailgun'
import createMailpitTransport from './mailpit'
import createSmtpTransport from './smtp'

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

  let transport: MaybeTransport = null
  switch (env.MAIL_TRANSPORT) {
    case 'mailgun':
      transport = createMailgunTransport(options)
      break
    case 'mailpit':
      transport = createMailpitTransport(options)
      break
    case 'smtp':
      transport = createSmtpTransport(options)
      break
    default:
      throw new Error('Invalid MAIL_TRANSPORT')
  }

  if (!transport) throw new Error('Could not create transport')

  // Middleware to convert HTML to text
  transport.use('compile', htmlToText())

  return transport
}
