import { render } from '@latitude-data/emails/render'
import Mail from 'nodemailer/lib/mailer'
import SMTPTransport from 'nodemailer/lib/smtp-transport'

import { TypedResult } from '../../../lib/Result'
import SuggestionMail from '@latitude-data/emails/SuggestionMail'
import Mailer from '../../Mailer'

export class SuggestionMailer extends Mailer {
  user: string
  document: string
  evaluation: string
  suggestion: string
  link: string

  constructor(
    options: Mail.Options,
    {
      user,
      document,
      evaluation,
      suggestion,
      link,
    }: {
      user: string
      document: string
      evaluation: string
      suggestion: string
      link: string
    },
  ) {
    super(options)

    this.user = user
    this.document = document
    this.evaluation = evaluation
    this.suggestion = suggestion
    this.link = link
  }

  async send(): Promise<TypedResult<SMTPTransport.SentMessageInfo, Error>> {
    return this.sendMail({
      to: this.options.to,
      from: this.options.from,
      subject: `A new suggestion to improve ${this.document}`,
      html: await render(
        SuggestionMail({
          user: this.user,
          document: this.document,
          evaluation: this.evaluation,
          suggestion: this.suggestion,
          link: this.link,
        }),
      ),
    })
  }
}
