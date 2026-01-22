import { render } from '@latitude-data/emails/render'
import Mail from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { TypedResult } from '../../../lib/Result'
import Mailer from '../../Mailer'
import { type User } from '../../../schema/models/types/User'
import DatasetReadyMail from '@latitude-data/emails/DatasetReadyMail'

export class DatasetReadyMailer extends Mailer {
  datasetId: number
  datasetName: string
  user: User

  constructor(
    {
      datasetId,
      datasetName,
      user,
    }: { datasetId: number; datasetName: string; user: User },
    options: Mail.Options,
  ) {
    super(options)

    this.datasetId = datasetId
    this.datasetName = datasetName
    this.user = user
  }

  async send(): Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>> {
    return this.sendMail({
      ...this.options,
      subject: 'Your dataset is ready!',
      html: await render(
        DatasetReadyMail({
          datasetId: this.datasetId,
          datasetName: this.datasetName,
          user: this.user,
        }),
      ),
    })
  }
}
