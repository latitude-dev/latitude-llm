import { render } from '@react-email/components'
import Mail from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { User } from '../../../../schema/types'
import { TypedResult } from '../../../../lib/Result'
import InvitationMail from '../../../emails/invitations/InvitationMail'
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
