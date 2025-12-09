import { render } from '@latitude-data/emails/render'
import InvitationMail from '@latitude-data/emails/InvitationMail'
import Mail from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { type User } from '../../../schema/models/types/User'
import { TypedResult } from '../../../lib/Result'
import Mailer from '../../Mailer'

export class InvitationMailer extends Mailer {
  invited: User
  invitee: User
  invitationToken: string

  constructor(
    options: Mail.Options,
    {
      invited,
      invitee,
      invitationToken,
    }: { invited: User; invitee: User; invitationToken: string },
  ) {
    super(options)

    this.invited = invited
    this.invitee = invitee
    this.invitationToken = invitationToken
  }

  async send(): Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>> {
    return this.sendMail({
      to: this.options.to,
      from: this.options.from,
      subject: 'You have been invited to join Latitude!',
      html: await render(
        InvitationMail({
          invited: this.invited,
          invitee: this.invitee,
          invitationToken: this.invitationToken,
        }),
      ),
    })
  }
}
