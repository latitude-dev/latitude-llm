import { env } from '@latitude-data/env'
import Plunk from '@plunk/node'
import { nanoid } from 'nanoid'
import nodemailer, { SentMessageInfo } from 'nodemailer'
import MailMessage from 'nodemailer/lib/mailer/mail-message'

import { MailerOptions } from '.'

export type MailgunResponse = {
  status: number
  message: string
  messageId: string
}

export default function createPlunkTransport({
  transportOptions,
}: MailerOptions) {
  const domain = env.LATITUDE_DOMAIN
  const apiKey = env.MAILER_API_KEY

  if (!domain || !apiKey) return null

  const transport = plunkTransport({ auth: { apiKey } })

  return nodemailer.createTransport<SentMessageInfo>(
    transport,
    transportOptions,
  )
}

const plunkTransport = ({ auth }: { auth: { apiKey: string } }) => {
  return {
    name: 'plunk',
    version: '0.0.1', // TODO: Get version from package.json
    send: async (
      { data: mail }: MailMessage,
      callback: (err: Error | null, info?: SentMessageInfo) => void,
    ) => {
      try {
        // NOTE: Remove this crazyness when Plunk fixes its packages :point_down:
        let plunk: Plunk
        // @ts-expect-error lol -> https://github.com/useplunk/node/issues/2
        if (Plunk.default) {
          // @ts-expect-error lol -> https://github.com/useplunk/node/issues/2
          plunk = new Plunk.default(auth.apiKey)
        } else {
          plunk = new Plunk(auth.apiKey)
        }

        await plunk.emails.send({
          to: mail.to as string,
          subject: mail.subject as string,
          body: mail.html as string,
        })

        callback(null, {
          messageId: nanoid(),
          status: 200,
        })
      } catch (err) {
        callback(err as Error)
      }
    },
  }
}
