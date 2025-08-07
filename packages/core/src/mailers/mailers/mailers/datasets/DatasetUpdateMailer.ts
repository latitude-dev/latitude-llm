import { render } from '@react-email/components'
import Mail from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { TypedResult } from '../../../../lib/Result'
import Mailer from '../../Mailer'
import { Dataset, User } from '../../../../browser'
import DatasetUpdateMail from '../../../emails/datasets/DatasetUpdateMail'

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
