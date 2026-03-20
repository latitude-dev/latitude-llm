import { type EmailMessage, EmailSendError, type EmailSender } from "@domain/email"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"
import { createTransport, type Transporter } from "nodemailer"
// @ts-expect-error -- no type declarations for nodemailer-mailgun-transport
import mailgunTransport from "nodemailer-mailgun-transport"

interface MailgunApiConfig {
  readonly apiKey: string | undefined
  readonly domain: string | undefined
  readonly region: "us" | "eu"
  readonly from: string | undefined
}

interface SmtpConfig {
  readonly host: string | undefined
  readonly port: number
  readonly user: string | undefined
  readonly pass: string | undefined
  readonly from: string | undefined
}

interface MailpitConfig {
  readonly host: string
  readonly port: number
  readonly from: string
}

export interface EmailTransportConfig {
  readonly mailgun?: Partial<MailgunApiConfig>
  readonly smtp?: Partial<SmtpConfig>
  readonly mailpit?: Partial<MailpitConfig>
}

type EmailProvider = "mailgun" | "smtp" | "mailpit"

interface ResolvedProvider {
  readonly provider: EmailProvider
  readonly transporter: Transporter
  readonly from: string | undefined
}

const getMailgunApiConfigFromEnv = (): MailgunApiConfig => {
  const apiKey = Effect.runSync(parseEnvOptional("LAT_MAILGUN_API_KEY", "string"))
  const domain = Effect.runSync(parseEnvOptional("LAT_MAILGUN_DOMAIN", "string"))
  const regionRaw = Effect.runSync(parseEnvOptional("LAT_MAILGUN_REGION", "string"))
  const from = Effect.runSync(parseEnvOptional("LAT_MAILGUN_FROM", "string"))

  return {
    apiKey,
    domain,
    region: regionRaw === "eu" ? "eu" : "us",
    from,
  }
}

const getSmtpConfigFromEnv = (): SmtpConfig => {
  const host = Effect.runSync(parseEnvOptional("LAT_SMTP_HOST", "string"))
  const port = Effect.runSync(parseEnv("LAT_SMTP_PORT", "number", 587))
  const user = Effect.runSync(parseEnvOptional("LAT_SMTP_USER", "string"))
  const pass = Effect.runSync(parseEnvOptional("LAT_SMTP_PASS", "string"))
  const from = Effect.runSync(parseEnvOptional("LAT_SMTP_FROM", "string"))

  return { host, port, user, pass, from }
}

const getMailpitConfigFromEnv = (): MailpitConfig => {
  const host = Effect.runSync(parseEnv("LAT_MAILPIT_HOST", "string", "localhost"))
  const port = Effect.runSync(parseEnv("LAT_MAILPIT_PORT", "number", 1025))
  const from = Effect.runSync(parseEnv("LAT_MAILPIT_FROM", "string", "noreply@latitude.local"))

  return { host, port, from }
}

const mergeMailgunConfig = (
  base: MailgunApiConfig,
  override: Partial<MailgunApiConfig> | undefined,
): MailgunApiConfig => {
  if (!override) return base
  return { ...base, ...override, region: override.region ?? base.region }
}

const mergeSmtpConfig = (base: SmtpConfig, override: Partial<SmtpConfig> | undefined): SmtpConfig => {
  if (!override) return base
  return { ...base, ...override }
}

const mergeMailpitConfig = (base: MailpitConfig, override: Partial<MailpitConfig> | undefined): MailpitConfig => {
  if (!override) return base
  return { ...base, ...override }
}

const resolveProvider = ({
  mailgun,
  smtp,
  mailpit,
}: {
  mailgun: MailgunApiConfig
  smtp: SmtpConfig
  mailpit: MailpitConfig
}): ResolvedProvider => {
  if (mailgun.apiKey && mailgun.domain) {
    const host = mailgun.region === "eu" ? "api.eu.mailgun.net" : "api.mailgun.net"
    const transport = mailgunTransport({
      host,
      auth: { apiKey: mailgun.apiKey, domain: mailgun.domain },
    })
    return {
      provider: "mailgun",
      transporter: createTransport(transport),
      from: mailgun.from ?? `postmaster@${mailgun.domain}`,
    }
  }

  if (smtp.host && smtp.user && smtp.pass) {
    return {
      provider: "smtp",
      transporter: createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      }),
      from: smtp.from,
    }
  }

  return {
    provider: "mailpit",
    transporter: createTransport({
      host: mailpit.host,
      port: mailpit.port,
      secure: false,
      tls: { rejectUnauthorized: false },
    }),
    from: mailpit.from,
  }
}

export const createEmailTransportSender = (config?: EmailTransportConfig): EmailSender => {
  const resolved = resolveProvider({
    mailgun: mergeMailgunConfig(getMailgunApiConfigFromEnv(), config?.mailgun),
    smtp: mergeSmtpConfig(getSmtpConfigFromEnv(), config?.smtp),
    mailpit: mergeMailpitConfig(getMailpitConfigFromEnv(), config?.mailpit),
  })

  return {
    send: (message: EmailMessage): Effect.Effect<void, EmailSendError> => {
      return Effect.gen(function* () {
        const resolvedFrom = message.from ?? resolved.from

        if (!resolvedFrom) {
          return yield* new EmailSendError({
            message: "Email sender is configured without a from address",
          })
        }

        yield* Effect.tryPromise({
          try: () =>
            resolved.transporter.sendMail({
              from: resolvedFrom,
              to: message.to,
              subject: message.subject,
              html: message.html,
              text: message.text,
              replyTo: message.replyTo,
            }),
          catch: (error: unknown) =>
            new EmailSendError({
              message:
                error instanceof Error
                  ? `Failed to send email via ${resolved.provider}: ${error.message}`
                  : `Failed to send email via ${resolved.provider}`,
              cause: error,
            }),
        })
      })
    },
  }
}
