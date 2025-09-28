import { render } from '@react-email/components'
import Mail from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { User } from '../../../../schema/types'
import { TypedResult } from '../../../../lib/Result'
import ReferralMail from '../../../emails/invitations/ReferralMail'
import Mailer from '../../Mailer'

export class ReferralMailer extends Mailer {
  email: string
  invitee: User

  constructor(
    options: Mail.Options,
    { email, invitee }: { email: string; invitee: User },
  ) {
    super(options)

    this.email = email
    this.invitee = invitee
  }

  async send(): Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>> {
    return this.sendMail({
      to: this.options.to,
      from: this.options.from,
      subject: 'You have been invited to join Latitude!',
      html: await render(
        ReferralMail({
          invitee: this.invitee,
        }),
      ),
    })
  }
}
