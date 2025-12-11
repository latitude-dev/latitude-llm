import { render } from '@latitude-data/emails/render'
import { NotificiationsLayoutProps } from '@latitude-data/emails/types'
import Mail from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { TypedResult } from '../../../lib/Result'
import WeeklyEmailMail from '@latitude-data/emails/WeeklyEmailMail'
import Mailer from '../../Mailer'
import { RecipientBatch } from '../../buildBatchRecipients'
import { WeeklyEmailMailProps } from '@latitude-data/emails/WeeklyEmailMailTypes'

export class WeeklyEmailMailer extends Mailer {
  async send({
    to,
    recipientVariables,
    currentWorkspace,
    logs,
    issues,
    annotations,
  }: {
    to: Mail.Options['to']
    recipientVariables: RecipientBatch['recipientVariables']
    currentWorkspace: NotificiationsLayoutProps['currentWorkspace']
    logs: WeeklyEmailMailProps['logs']
    issues: WeeklyEmailMailProps['issues']
    annotations: WeeklyEmailMailProps['annotations']
  }): Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>> {
    return this.sendMail({
      to,
      from: this.options.from,
      subject: `📊 Your weekly summary for ${currentWorkspace.name}`,
      'recipient-variables': recipientVariables,
      html: await render(
        WeeklyEmailMail({
          currentWorkspace,
          logs,
          issues,
          annotations,
        }),
      ),
    })
  }
}
