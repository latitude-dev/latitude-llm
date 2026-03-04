import { type EmailMessage, EmailSendError, type EmailSender } from "@domain/email"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"
import { type Transporter, createTransport } from "nodemailer"

interface MailgunSmtpConfig {
  readonly host: string | undefined
  readonly port: number
  readonly user: string | undefined
  readonly pass: string | undefined
  readonly from: string | undefined
  readonly domain: string | undefined
  readonly region: "us" | "eu"
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
  readonly mailgun?: Partial<MailgunSmtpConfig>
  readonly smtp?: Partial<SmtpConfig>
  readonly mailpit?: Partial<MailpitConfig>
}

type EmailProvider = "mailgun" | "smtp" | "mailpit"

interface ProviderConfig {
  readonly provider: EmailProvider
  readonly transportConfig: {
    readonly host: string
    readonly port: number
    readonly secure: boolean
    readonly auth?: {
      readonly user: string
      readonly pass: string
    }
    readonly tls?: {
      readonly rejectUnauthorized: boolean
    }
  }
  readonly from: string | undefined
}

const getMailgunDefaults = ({
  domain,
  region,
}: {
  domain: string | undefined
  region: "us" | "eu"
}): { host: string; user: string | undefined } => {
  const host = region === "eu" ? "smtp.eu.mailgun.org" : "smtp.mailgun.org"
  const user = domain ? `postmaster@${domain}` : undefined

  return { host, user }
}

const getMailgunSmtpConfigFromEnv = (): MailgunSmtpConfig => {
  const domain = Effect.runSync(parseEnvOptional("LAT_MAILGUN_DOMAIN", "string"))
  const region = Effect.runSync(parseEnvOptional("LAT_MAILGUN_REGION", "string"))
  const defaults = getMailgunDefaults({
    domain,
    region: region === "eu" ? "eu" : "us",
  })

  const host = Effect.runSync(parseEnvOptional("LAT_MAILGUN_SMTP_HOST", "string")) ?? defaults.host
  const port = Effect.runSync(parseEnv("LAT_MAILGUN_SMTP_PORT", "number", 587))
  const user = Effect.runSync(parseEnvOptional("LAT_MAILGUN_SMTP_USER", "string")) ?? defaults.user
  const pass =
    Effect.runSync(parseEnvOptional("LAT_MAILGUN_SMTP_PASS", "string")) ??
    Effect.runSync(parseEnvOptional("LAT_MAILGUN_API_KEY", "string"))
  const from = Effect.runSync(parseEnvOptional("LAT_MAILGUN_FROM", "string"))

  return {
    host,
    port,
    user,
    pass,
    from,
    domain,
    region: region === "eu" ? "eu" : "us",
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
  base: MailgunSmtpConfig,
  override: Partial<MailgunSmtpConfig> | undefined,
): MailgunSmtpConfig => {
  if (!override) {
    return base
  }

  return {
    ...base,
    ...override,
    region: override.region ?? base.region,
  }
}

const mergeSmtpConfig = (base: SmtpConfig, override: Partial<SmtpConfig> | undefined): SmtpConfig => {
  if (!override) {
    return base
  }

  return {
    ...base,
    ...override,
  }
}

const mergeMailpitConfig = (base: MailpitConfig, override: Partial<MailpitConfig> | undefined): MailpitConfig => {
  if (!override) {
    return base
  }

  return {
    ...base,
    ...override,
  }
}

const resolveProviderConfig = ({
  mailgun,
  smtp,
  mailpit,
}: {
  mailgun: MailgunSmtpConfig
  smtp: SmtpConfig
  mailpit: MailpitConfig
}): ProviderConfig => {
  if (mailgun.host && mailgun.user && mailgun.pass) {
    return {
      provider: "mailgun",
      transportConfig: {
        host: mailgun.host,
        port: mailgun.port,
        secure: mailgun.port === 465,
        auth: {
          user: mailgun.user,
          pass: mailgun.pass,
        },
      },
      from: mailgun.from ?? (mailgun.domain ? `postmaster@${mailgun.domain}` : undefined),
    }
  }

  if (smtp.host && smtp.user && smtp.pass) {
    return {
      provider: "smtp",
      transportConfig: {
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: {
          user: smtp.user,
          pass: smtp.pass,
        },
      },
      from: smtp.from,
    }
  }

  return {
    provider: "mailpit",
    transportConfig: {
      host: mailpit.host,
      port: mailpit.port,
      secure: false,
      tls: {
        rejectUnauthorized: false,
      },
    },
    from: mailpit.from,
  }
}

const createNodemailerTransporter = (config: ProviderConfig): Effect.Effect<Transporter, never> => {
  return Effect.sync(() =>
    createTransport({
      host: config.transportConfig.host,
      port: config.transportConfig.port,
      secure: config.transportConfig.secure,
      auth: config.transportConfig.auth,
      tls: config.transportConfig.tls,
    }),
  )
}

export const createEmailTransportSender = (config?: EmailTransportConfig): EmailSender => {
  const providerConfig = resolveProviderConfig({
    mailgun: mergeMailgunConfig(getMailgunSmtpConfigFromEnv(), config?.mailgun),
    smtp: mergeSmtpConfig(getSmtpConfigFromEnv(), config?.smtp),
    mailpit: mergeMailpitConfig(getMailpitConfigFromEnv(), config?.mailpit),
  })

  return {
    send: (message: EmailMessage): Effect.Effect<void, EmailSendError> => {
      return Effect.gen(function* () {
        const resolvedFrom = message.from ?? providerConfig.from

        if (!resolvedFrom) {
          return yield* new EmailSendError({
            message: "Email sender is configured without a from address",
          })
        }

        const transporter = yield* createNodemailerTransporter(providerConfig)

        yield* Effect.tryPromise({
          try: () =>
            transporter.sendMail({
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
                  ? `Failed to send email via ${providerConfig.provider}: ${error.message}`
                  : `Failed to send email via ${providerConfig.provider}`,
              cause: error,
            }),
        })
      })
    },
  }
}
