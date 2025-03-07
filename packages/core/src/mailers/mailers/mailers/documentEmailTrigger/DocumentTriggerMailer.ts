import { render } from '@react-email/components'
import Mail from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { TypedResult } from '../../../../lib/Result'
import Mailer from '../../Mailer'
import { LatitudeError } from '../../../../lib'
import type { AssistantMessage } from '@latitude-data/compiler'
import DocumentTriggerResponseMail from '../../../emails/documentTrigger/DocumentTriggerResponseMail'

export class DocumentTriggerMailer extends Mailer {
  subject: string
  result: TypedResult<AssistantMessage, LatitudeError>

  constructor(
    options: Mail.Options,
    {
      subject,
      result,
    }: {
      subject: string
      result: TypedResult<AssistantMessage, LatitudeError>
    },
  ) {
    super(options)

    this.subject = subject
    this.result = result
  }

  async send(): Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>> {
    return this.sendMail({
      to: this.options.to,
      from: this.options.from,
      subject: this.subject,
      html: await render(DocumentTriggerResponseMail({ result: this.result })),
    })
  }
}
