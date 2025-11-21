import { render } from '@react-email/components'
import Mail, { Address } from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { TypedResult } from '../../../../lib/Result'
import IssueEscalatingMail from '../../../emails/issues/IssueEscalatingMail'
import Mailer from '../../Mailer'
import { NotificiationsLayoutProps } from '../../../emails/_components/ContainerLayoutWithNotificationSettings'

function convertTo(to: Mail.Options['to']): Address[] {
  if (!Array.isArray(to)) {
    if (!to) return []
    if (typeof to === 'string') {
      return [{ address: to, name: to }]
    }
    return [to]
  }

  return to.map((email) => {
    if (typeof email === 'string') {
      return { address: email, name: email }
    }
    return email
  })
}

export type SendIssueEscalatingMailOptions = {
  to: Mail.Options['to']
  recipientVariables?: Record<string, Record<string, unknown>>
  currentUser: NotificiationsLayoutProps['currentUser']
}
export class IssueEscalatingMailer extends Mailer {
  issueTitle: string
  link: string

  constructor(
    options: Mail.Options,
    { issueTitle, link }: { issueTitle: string; link: string },
  ) {
    super(options)

    this.issueTitle = issueTitle
    this.link = link
  }

  async send({
    to,
    recipientVariables,
    currentUser,
  }: SendIssueEscalatingMailOptions): Promise<
    TypedResult<SMTPTransport.SentMessageInfo, Error>
  > {
    const emails = convertTo(to ?? this.options.to)
    return this.sendMail({
      to: emails,
      from: this.options.from,
      subject: `📈 Latitude issue Escalating: ${this.issueTitle}`,
      'recipient-variables': recipientVariables,
      html: await render(
        IssueEscalatingMail({
          issueTitle: this.issueTitle,
          link: this.link,
          currentUser,
        }),
      ),
    })
  }
}
