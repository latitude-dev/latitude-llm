import { TypedResult } from '@latitude-data/core/lib/Result'
import { render } from '@react-email/components'
import Mail from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import MagicLinkMail from '../../../emails/magicLinks/magicLinkMail'
import Mailer from '../../Mailer'

export class MagicLinkMailer extends Mailer {
  user: string
  magicLinkToken: string

  constructor(
    options: Mail.Options,
    { user, magicLinkToken }: { user: string; magicLinkToken: string },
  ) {
    super(options)

    this.user = user
    this.magicLinkToken = magicLinkToken
  }

  async send(): Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>> {
    return this.sendMail({
      to: this.options.to,
      from: this.options.from,
      subject: 'Your Magic Link to Latitude',
      html: await render(
        MagicLinkMail({
          user: this.user,
          magicLinkToken: this.magicLinkToken,
        }),
      ),
    })
  }
}
