import { render } from '@latitude-data/emails/render'
import Mail from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { TypedResult } from '../../../lib/Result'
import Mailer from '../../Mailer'
import type { AssistantMessage } from '@latitude-data/constants/messages'
import DocumentTriggerResponseMail from '@latitude-data/emails/DocumentTriggerResponseMail'

export class DocumentTriggerMailer extends Mailer {
  result: TypedResult<AssistantMessage, Error>

  constructor(
    result: TypedResult<AssistantMessage, Error>,
    options: Mail.Options,
  ) {
    super(options)

    this.result = result
  }

  async send(): Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>> {
    return this.sendMail({
      ...this.options,
      html: await render(
        DocumentTriggerResponseMail({
          error: this.result.error,
          message: this.result.value,
        }),
      ),
    })
  }
}
