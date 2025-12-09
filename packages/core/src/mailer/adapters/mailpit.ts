import nodemailer from 'nodemailer'

import { MailerOptions } from '.'

export default function createMailtrapTransport({
  transportOptions,
}: MailerOptions) {
  return nodemailer.createTransport(
    {
      port: 1025,
      auth: {
        user: 'readfort',
        pass: 'secret',
      },
    },
    transportOptions,
  )
}
