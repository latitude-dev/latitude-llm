import { render } from '@react-email/components'
import Mail from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { TypedResult } from '../../../../lib/Result'
import Mailer from '../../Mailer'
import type { AssistantMessage } from '@latitude-data/constants'
import DocumentTriggerResponseMail from '../../../emails/documentTrigger/DocumentTriggerResponseMail'
import { LatitudeError } from '@latitude-data/constants/errors'

export class DocumentTriggerMailer extends Mailer {
  result: TypedResult<AssistantMessage, LatitudeError>

  constructor(
    result: TypedResult<AssistantMessage, LatitudeError>,
    options: Mail.Options,
  ) {
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
