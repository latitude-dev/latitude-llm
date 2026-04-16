import { Effect } from "effect"
import type { EmailContent } from "../entities/email.ts"
import type { EmailSendError } from "../errors.ts"
import type { EmailSender } from "../ports/email-sender.ts"

/**
 * Send email use case
 *
 * Generic use case for sending emails via the EmailSender port.
 * Can be used for any email type (magic link, notifications, etc.)
 */

export const sendEmail = ({ emailSender }: { readonly emailSender: EmailSender }) => {
  return (email: EmailContent): Effect.Effect<void, EmailSendError> => {
    return emailSender
      .send({
        to: email.to,
        subject: email.subject,
        html: email.html,
        ...(email.text && { text: email.text }),
      })
      .pipe(Effect.withSpan("email.sendEmail"))
  }
}

export type SendEmail = ReturnType<typeof sendEmail>
