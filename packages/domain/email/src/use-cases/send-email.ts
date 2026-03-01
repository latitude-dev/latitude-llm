import type { Effect } from "effect";
import type { EmailContent } from "../entities/email.js";
import type { EmailSendError, EmailSender } from "../ports/email-sender.js";

/**
 * Send email use case
 *
 * Generic use case for sending emails via the EmailSender port.
 * Can be used for any email type (magic link, notifications, etc.)
 */

export const sendEmail = (deps: {
  readonly emailSender: EmailSender;
}) => {
  return (email: EmailContent): Effect.Effect<void, EmailSendError> => {
    return deps.emailSender.send({
      to: email.to,
      subject: email.subject,
      html: email.html,
      ...(email.text && { text: email.text }),
    });
  };
};

export type SendEmail = ReturnType<typeof sendEmail>;
