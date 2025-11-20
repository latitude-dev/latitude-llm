import { render } from '@latitude-data/emails/render'
import DatasetUpdateMail from '@latitude-data/emails/DatasetUpdateMail'
import Mail from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { TypedResult } from '../../../../lib/Result'
import Mailer from '../../Mailer'
import { type Dataset } from '../../../../schema/models/types/Dataset'
import { type User } from '../../../../schema/models/types/User'

export class DatasetUpdateMailer extends Mailer {
  dataset: Dataset
  user: User

  constructor(
    { dataset, user }: { dataset: Dataset; user: User },
    options: Mail.Options,
  ) {
    super(options)

    this.dataset = dataset
    this.user = user
  }

  async send(): Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>> {
    return this.sendMail({
      ...this.options,
      subject: 'Your dataset has been updated!',
      html: await render(
        DatasetUpdateMail({ dataset: this.dataset, user: this.user }),
      ),
    })
  }
}
