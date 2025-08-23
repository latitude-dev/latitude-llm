import { render } from '@react-email/components'
import type Mail from 'nodemailer/lib/mailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'

import type { TypedResult } from '../../../../lib/Result'
import MagicLinkMail from '../../../emails/magicLinks/magicLinkMail'
import Mailer from '../../Mailer'

export class MagicLinkMailer extends Mailer {
  user: string
  magicLinkToken: string
  returnTo?: string

  constructor(
    options: Mail.Options,
    { user, magicLinkToken, returnTo }: { user: string; magicLinkToken: string; returnTo?: string },
  ) {
    super(options)

    this.user = user
    this.magicLinkToken = magicLinkToken
    this.returnTo = returnTo
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
          returnTo: this.returnTo,
        }),
      ),
    })
  }
}
