import { type EmailMessage, EmailSendError, type EmailSender } from "@domain/email";
import { parseEnvOptional } from "@platform/env";
import { Effect } from "effect";
import { type Transporter, createTransport } from "nodemailer";

/**
 * Nodemailer email sender adapter
 *
 * Implements the EmailSender port using Nodemailer for SMTP-based email delivery.
 * Configured via environment variables for Mailpit/SMTP settings.
 */

export interface NodemailerConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly from: string;
  readonly tls:
    | {
        readonly rejectUnauthorized: boolean;
      }
    | undefined;
}

const defaultConfig: NodemailerConfig = {
  host: "localhost",
  port: 1025,
  secure: false,
  from: "noreply@latitude.local",
  tls: {
    rejectUnauthorized: false,
  },
};

const getConfigFromEnv = (): NodemailerConfig => {
  const host =
    Effect.runSync(parseEnvOptional(process.env.MAILPIT_HOST, "string")) ?? defaultConfig.host;
  const portStr =
    Effect.runSync(parseEnvOptional(process.env.MAILPIT_PORT, "string")) ??
    String(defaultConfig.port);
  const from =
    Effect.runSync(parseEnvOptional(process.env.MAILPIT_FROM, "string")) ?? defaultConfig.from;

  return {
    host,
    port: Number.parseInt(portStr, 10),
    secure: defaultConfig.secure,
    from,
    tls: defaultConfig.tls,
  };
};

const mergeConfig = (
  base: NodemailerConfig,
  override?: Partial<NodemailerConfig>,
): NodemailerConfig => {
  if (!override) return base;

  return {
    host: override.host ?? base.host,
    port: override.port ?? base.port,
    secure: override.secure ?? base.secure,
    from: override.from ?? base.from,
    tls: override.tls ?? base.tls,
  };
};

const createNodemailerTransporter = (
  config: NodemailerConfig,
): Effect.Effect<Transporter, never> => {
  return Effect.sync(() =>
    createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      tls: config.tls,
    }),
  );
};

export const createNodemailerEmailSender = (config?: Partial<NodemailerConfig>): EmailSender => {
  const finalConfig = mergeConfig(getConfigFromEnv(), config);

  return {
    send: (message: EmailMessage): Effect.Effect<void, EmailSendError> => {
      return Effect.gen(function* () {
        const transporter = yield* createNodemailerTransporter(finalConfig);

        yield* Effect.tryPromise({
          try: () =>
            transporter.sendMail({
              from: message.from ?? finalConfig.from,
              to: message.to,
              subject: message.subject,
              html: message.html,
              text: message.text,
              replyTo: message.replyTo,
            }),
          catch: (error) =>
            new EmailSendError({
              message: error instanceof Error ? error.message : "Failed to send email",
              cause: error,
            }),
        });
      });
    },
  };
};
