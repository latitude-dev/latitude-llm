import { render } from '@latitude-data/emails/render'
import Mail from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { TypedResult } from '../../../lib/Result'
import Mailer from '../../Mailer'
import { type User } from '../../../schema/models/types/User'
import ExportReadyMail from '@latitude-data/emails/ExportReadyMail'

export class ExportReadyMailer extends Mailer {
  token: string
  user: User

  constructor(
    { token, user }: { token: string; user: User },
    options: Mail.Options,
  ) {
    super(options)

    this.token = token
    this.user = user
  }

  async send(): Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>> {
    return this.sendMail({
      ...this.options,
      subject: 'Your export is ready!',
      html: await render(
        ExportReadyMail({ token: this.token, user: this.user }),
      ),
    })
  }
}
