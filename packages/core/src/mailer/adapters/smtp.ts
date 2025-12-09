import { env } from '@latitude-data/env'
import nodemailer, { Transporter } from 'nodemailer'

import { MailerOptions } from '.'

export default function createSmtpTransport({
  transportOptions,
}: MailerOptions): Transporter | null {
  const host = env.SMTP_HOST
  const port = env.SMTP_PORT
  const secure = env.SMTP_SECURE === 'true'
  const user = env.SMTP_USER
  const pass = env.SMTP_PASS

  if (!host || !port || !user || !pass) {
    throw new Error(
      'SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS must be set when MAIL_TRANSPORT=smtp',
    )
  }

  const transport = nodemailer.createTransport(
    {
      host,
      port: Number(port),
      secure,
      auth: {
        user,
        pass,
      },
    },
    transportOptions,
  )

  return transport
}
