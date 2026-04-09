import { type EmailMessage, EmailSendError, type EmailSender } from "@domain/email"
import { type InvalidEnvValueError, type MissingEnvValueError, parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"
import { createTransport } from "nodemailer"

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

type SendFn = (message: EmailMessage, from: string) => Promise<void>

interface ResolvedProvider {
  readonly provider: EmailProvider
  readonly sendFn: SendFn
  readonly from: string | undefined
}

/** Env-derived email transport inputs (before optional caller overrides). */
export interface EmailTransportEnvResolved {
  readonly mailgun: MailgunApiConfig
  readonly smtp: SmtpConfig
  readonly mailpit: MailpitConfig
}

export type EmailTransportEnvError = MissingEnvValueError | InvalidEnvValueError

const mailgunApiConfigFromEnv: Effect.Effect<MailgunApiConfig, EmailTransportEnvError> = Effect.gen(function* () {
  const apiKey = yield* parseEnvOptional("LAT_MAILGUN_API_KEY", "string")
  const domain = yield* parseEnvOptional("LAT_MAILGUN_DOMAIN", "string")
  const regionRaw = yield* parseEnvOptional("LAT_MAILGUN_REGION", "string")
  const from = yield* parseEnvOptional("LAT_MAILGUN_FROM", "string")

  return {
    apiKey,
    domain,
    region: regionRaw === "eu" ? "eu" : "us",
    from,
  }
})

const smtpConfigFromEnv: Effect.Effect<SmtpConfig, EmailTransportEnvError> = Effect.gen(function* () {
  const host = yield* parseEnvOptional("LAT_SMTP_HOST", "string")
  const port = yield* parseEnv("LAT_SMTP_PORT", "number", 587)
  const user = yield* parseEnvOptional("LAT_SMTP_USER", "string")
  const pass = yield* parseEnvOptional("LAT_SMTP_PASS", "string")
  const from = yield* parseEnvOptional("LAT_SMTP_FROM", "string")

  return { host, port, user, pass, from }
})

const mailpitConfigFromEnv: Effect.Effect<MailpitConfig, EmailTransportEnvError> = Effect.gen(function* () {
  const host = yield* parseEnv("LAT_MAILPIT_HOST", "string", "localhost")
  const port = yield* parseEnv("LAT_MAILPIT_PORT", "number", 1025)
  const from = yield* parseEnv("LAT_MAILPIT_FROM", "string", "noreply@latitude.local")

  return { host, port, from }
})

/**
 * Reads all email-related env vars in one Effect pipeline (single interpreter run at the boundary).
 */
export const emailTransportEnvConfig: Effect.Effect<EmailTransportEnvResolved, EmailTransportEnvError> = Effect.gen(
  function* () {
    const mailgun = yield* mailgunApiConfigFromEnv
    const smtp = yield* smtpConfigFromEnv
    const mailpit = yield* mailpitConfigFromEnv
    return { mailgun, smtp, mailpit }
  },
)

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

const createMailgunSendFn = (apiKey: string, domain: string, region: "us" | "eu"): SendFn => {
  const apiHost = region === "eu" ? "api.eu.mailgun.net" : "api.mailgun.net"
  const url = `https://${apiHost}/v3/${domain}/messages`
  const authHeader = `Basic ${btoa(`api:${apiKey}`)}`

  return async (message, from) => {
    const body = new FormData()
    body.append("from", from)
    body.append("to", message.to)
    body.append("subject", message.subject)
    body.append("html", message.html)
    if (message.text) body.append("text", message.text)
    if (message.replyTo) body.append("h:Reply-To", message.replyTo)

    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: authHeader },
      body,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Mailgun API ${response.status}: ${text}`)
    }
  }
}

const createSmtpSendFn = (host: string, port: number, user: string, pass: string): SendFn => {
  const transporter = createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  return async (message, from) => {
    await transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
    })
  }
}

const createMailpitSendFn = (host: string, port: number): SendFn => {
  const transporter = createTransport({
    host,
    port,
    secure: false,
    tls: { rejectUnauthorized: false },
  })

  return async (message, from) => {
    await transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
    })
  }
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
    return {
      provider: "mailgun",
      sendFn: createMailgunSendFn(mailgun.apiKey, mailgun.domain, mailgun.region),
      from: mailgun.from ?? `postmaster@${mailgun.domain}`,
    }
  }

  if (smtp.host && smtp.user && smtp.pass) {
    return {
      provider: "smtp",
      sendFn: createSmtpSendFn(smtp.host, smtp.port, smtp.user, smtp.pass),
      from: smtp.from,
    }
  }

  return {
    provider: "mailpit",
    sendFn: createMailpitSendFn(mailpit.host, mailpit.port),
    from: mailpit.from,
  }
}

export const createEmailTransportSender = (config?: EmailTransportConfig): EmailSender => {
  const env = Effect.runSync(emailTransportEnvConfig)
  const resolved = resolveProvider({
    mailgun: mergeMailgunConfig(env.mailgun, config?.mailgun),
    smtp: mergeSmtpConfig(env.smtp, config?.smtp),
    mailpit: mergeMailpitConfig(env.mailpit, config?.mailpit),
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
          try: () => resolved.sendFn(message, resolvedFrom),
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
