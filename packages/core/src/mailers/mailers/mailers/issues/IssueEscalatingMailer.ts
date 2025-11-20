import { render } from '@latitude-data/emails/render'
import { NotificiationsLayoutProps } from '@latitude-data/emails/types'
import Mail from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { TypedResult } from '../../../../lib/Result'
import IssueEscalatingMail, {
  IssueEscalatingMailProps,
} from '@latitude-data/emails/IssueEscalatingMail'
import Mailer from '../../Mailer'

export type SendIssueEscalatingMailOptions = {
  to: Mail.Options['to']
  recipientVariables?: Record<string, Record<string, unknown>>
  currentWorkspace: NotificiationsLayoutProps['currentWorkspace']
  issue: IssueEscalatingMailProps['issue']
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
    currentWorkspace,
    issue,
  }: SendIssueEscalatingMailOptions): Promise<
    TypedResult<SMTPTransport.SentMessageInfo, Error>
  > {
    try {
      const html = await render(
        IssueEscalatingMail({
          issueTitle: this.issueTitle,
          link: this.link,
          currentWorkspace,
          issue,
        }),
      )

      const result = await this.sendMail({
        to,
        from: this.options.from,
        subject: `📈 Latitude issue Escalating: ${this.issueTitle}`,
        'recipient-variables': recipientVariables,
        html,
      })

      return result
    } catch (error) {
      console.error('[IssueEscalatingMailer] Error during send:', error)
      throw error
    }
  }
}
