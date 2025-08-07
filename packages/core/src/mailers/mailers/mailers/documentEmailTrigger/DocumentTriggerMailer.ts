import { render } from '@react-email/components'
import type Mail from 'nodemailer/lib/mailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'

import type { TypedResult } from '../../../../lib/Result'
import Mailer from '../../Mailer'
import type { AssistantMessage } from '@latitude-data/constants/legacyCompiler'
import DocumentTriggerResponseMail from '../../../emails/documentTrigger/DocumentTriggerResponseMail'

export class DocumentTriggerMailer extends Mailer {
  result: TypedResult<AssistantMessage, Error>

  constructor(result: TypedResult<AssistantMessage, Error>, options: Mail.Options) {
    super(options)

    this.result = result
  }

  async send(): Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>> {
    return this.sendMail({
      ...this.options,
      html: await render(DocumentTriggerResponseMail({ result: this.result })),
    })
  }
}
