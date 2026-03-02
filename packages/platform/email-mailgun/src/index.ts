import { type EmailMessage, EmailSendError, type EmailSender } from "@domain/email"
import { parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

/**
 * Mailgun email sender adapter
 *
 * Implements the EmailSender port using Mailgun's REST API for email delivery.
 * Configured via environment variables for Mailgun settings.
 */

export interface MailgunConfig {
  readonly apiKey: string
  readonly domain: string
  readonly from: string
  readonly region: "us" | "eu"
}

type MutablePartial<T> = {
  -readonly [P in keyof T]?: T[P]
}

const getConfigFromEnv = (): Partial<MailgunConfig> => {
  const apiKey = Effect.runSync(parseEnvOptional(process.env.MAILGUN_API_KEY, "string"))
  const domain = Effect.runSync(parseEnvOptional(process.env.MAILGUN_DOMAIN, "string"))
  const from = Effect.runSync(parseEnvOptional(process.env.MAILGUN_FROM, "string"))
  const region = Effect.runSync(parseEnvOptional(process.env.MAILGUN_REGION, "string"))

  const config: MutablePartial<MailgunConfig> = {}
  if (apiKey) config.apiKey = apiKey
  if (domain) config.domain = domain
  if (from) config.from = from
  config.region = region === "eu" ? "eu" : "us"

  return config
}

const getBaseUrl = (region: "us" | "eu"): string => {
  return region === "eu" ? "https://api.eu.mailgun.net/v3" : "https://api.mailgun.net/v3"
}

const createBasicAuth = (apiKey: string): string => {
  return Buffer.from(`api:${apiKey}`).toString("base64")
}

export const createMailgunEmailSender = (config?: Partial<MailgunConfig>): EmailSender => {
  const envConfig = getConfigFromEnv()
  const finalConfig: MailgunConfig = {
    apiKey: config?.apiKey ?? envConfig.apiKey ?? "",
    domain: config?.domain ?? envConfig.domain ?? "",
    from: config?.from ?? envConfig.from ?? "noreply@latitude.so",
    region: config?.region ?? envConfig.region ?? "us",
  }

  return {
    send: (message: EmailMessage): Effect.Effect<void, EmailSendError> => {
      return Effect.gen(function* () {
        if (!finalConfig.apiKey || !finalConfig.domain) {
          return yield* new EmailSendError({
            message: "Mailgun API key or domain not configured",
          })
        }

        const baseUrl = getBaseUrl(finalConfig.region)
        const auth = createBasicAuth(finalConfig.apiKey)

        const formData = new URLSearchParams()
        formData.append("from", message.from ?? finalConfig.from)
        formData.append("to", message.to)
        formData.append("subject", message.subject)
        formData.append("html", message.html)
        if (message.text) {
          formData.append("text", message.text)
        }
        if (message.replyTo) {
          formData.append("h:Reply-To", message.replyTo)
        }

        yield* Effect.tryPromise({
          try: async () => {
            const response = await fetch(`${baseUrl}/${finalConfig.domain}/messages`, {
              method: "POST",
              headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: formData.toString(),
            })

            if (!response.ok) {
              const errorBody = await response.text()
              throw new Error(`Mailgun API error (${response.status}): ${errorBody}`)
            }
          },
          catch: (error: unknown) =>
            new EmailSendError({
              message: error instanceof Error ? error.message : "Failed to send email via Mailgun",
              cause: error,
            }),
        })
      })
    },
  }
}
