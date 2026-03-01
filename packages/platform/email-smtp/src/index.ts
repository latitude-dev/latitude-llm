import { type EmailMessage, EmailSendError, type EmailSender } from "@domain/email";
import { Effect } from "effect";
import { type Transporter, createTransport } from "nodemailer";

/**
 * SMTP email adapter
 *
 * For production email delivery via SMTP.
 * Works with SendGrid, AWS SES, or any SMTP server.
 */

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly pass: string;
  readonly from: string;
  readonly secure?: boolean;
}

export const createSmtpEmailSender = (config: SmtpConfig): EmailSender => {
  const transporter: Transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
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
            message: `Failed to send email via SMTP: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      });
    },
  };
};
