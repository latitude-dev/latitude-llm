import { type EmailMessage, EmailSendError, type EmailSender } from "@domain/email";
import sendgrid from "@sendgrid/mail";
import { Effect } from "effect";

/**
 * SendGrid email adapter
 *
 * For production email delivery via SendGrid API.
 * Alternative to SMTP for better deliverability and analytics.
 */

export interface SendGridConfig {
  readonly apiKey: string;
  readonly from: string;
}

export const createSendGridEmailSender = (config: SendGridConfig): EmailSender => {
  sendgrid.setApiKey(config.apiKey);

  return {
    send: (message: EmailMessage): Effect.Effect<void, EmailSendError> => {
      return Effect.tryPromise({
        try: async () => {
          await sendgrid.send({
            from: message.from ?? config.from,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
            replyTo: message.replyTo,
          });
        },
        catch: (error) =>
          new EmailSendError({
            message: `Failed to send email via SendGrid: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });
    },
  };
};
