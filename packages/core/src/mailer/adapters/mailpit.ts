import { env } from '@latitude-data/env'
import nodemailer from 'nodemailer'

import { MailerOptions } from '.'

export default function createMailtrapTransport({
  transportOptions,
}: MailerOptions) {
  return nodemailer.createTransport(
    {
      host: env.MAILPIT_HOST,
      port: env.MAILPIT_PORT,
      auth: {
        user: 'readfort',
        pass: 'secret',
      },
    },
    transportOptions,
  )
}
