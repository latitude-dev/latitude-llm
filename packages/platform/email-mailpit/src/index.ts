import { type EmailMessage, EmailSendError, type EmailSender } from "@domain/email";
import { Effect } from "effect";
import { type Transporter, createTransport } from "nodemailer";

/**
 * Mailpit email adapter
 *
 * For local development using Mailpit (email catcher).
 * Mailpit runs in docker-compose and catches emails at localhost:1025.
 *
 * @see https://github.com/axllent/mailpit
 */

export interface MailpitConfig {
  readonly host: string;
  readonly port: number;
  readonly from: string;
}

export const createMailpitEmailSender = (config: MailpitConfig): EmailSender => {
  const transporter: Transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: false, // Mailpit doesn't use TLS
    tls: {
      rejectUnauthorized: false, // Allow self-signed certs in dev
    },
  });

  return {
    send: (message: EmailMessage): Effect.Effect<void, EmailSendError> => {
      return Effect.tryPromise({
        try: async () => {
          await transporter.sendMail({
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
            message: `Failed to send email via Mailpit: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });
    },
  };
};
