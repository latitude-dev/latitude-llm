import { type AuthIntent, normalizeEmail, resolveMagicLinkEmailTemplateFromContext } from "@domain/auth"
import { magicLinkTemplate, sendEmail, signupExistingAccountMagicLinkTemplate } from "@domain/email"
import { createBetterAuth } from "@platform/auth-better"
import {
  type PostgresClient,
  type PostgresDb,
  createAuthIntentPostgresRepository,
  createAuthUserPostgresRepository,
  createPostgresClient,
} from "@platform/db-postgres"
import { createMailgunEmailSender } from "@platform/email-mailgun"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

let postgresClientInstance: PostgresClient | undefined
let betterAuthInstance: ReturnType<typeof createBetterAuth> | undefined

interface AuthIntentEmailContext {
  readonly type: AuthIntent["type"]
  readonly existingAccountAtRequest: boolean
  readonly signupName?: string
}

const getAuthIntentIdFromMagicLinkUrl = ({
  magicLinkUrl,
  webUrl,
}: {
  magicLinkUrl: string
  webUrl: string
}): string | null => {
  const parsedMagicLinkUrl = new URL(magicLinkUrl)
  const callbackUrl = parsedMagicLinkUrl.searchParams.get("callbackURL")

  if (!callbackUrl) {
    return null
  }

  const parsedCallbackUrl = new URL(callbackUrl, webUrl)

  return parsedCallbackUrl.searchParams.get("authIntentId")
}

export const getPostgresClient = (): { db: PostgresDb; pool: PostgresClient["pool"] } => {
  if (!postgresClientInstance) {
    postgresClientInstance = createPostgresClient()
  }

  const postgresClient = postgresClientInstance

  if (!postgresClient) {
    throw new Error("Postgres client is not initialized")
  }

  return postgresClient
}

export const getBetterAuth = () => {
  if (!betterAuthInstance) {
    const { db } = getPostgresClient()

    const webUrl = Effect.runSync(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))
    const betterAuthSecret = Effect.runSync(parseEnv("LAT_BETTER_AUTH_SECRET", "string"))

    const trustedOriginsEnv = Effect.runSync(parseEnvOptional("LAT_TRUSTED_ORIGINS", "string"))
    const trustedOrigins = trustedOriginsEnv
      ? trustedOriginsEnv
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
      : [webUrl]

    const mailgunApiKey = Effect.runSync(parseEnvOptional("LAT_MAILGUN_API_KEY", "string"))
    const mailgunDomain = Effect.runSync(parseEnvOptional("LAT_MAILGUN_DOMAIN", "string"))

    const emailSender = createMailgunEmailSender()
    const sendEmailUseCase = sendEmail({ emailSender })
    const authIntents = createAuthIntentPostgresRepository(db)
    const users = createAuthUserPostgresRepository(db)

    betterAuthInstance = createBetterAuth({
      db,
      secret: betterAuthSecret,
      baseUrl: webUrl,
      basePath: "/api/auth",
      trustedOrigins,
      enableTanStackCookies: true,
      sendMagicLink: async ({ email, url, token }) => {
        if (!mailgunApiKey || !mailgunDomain) {
          console.info(`[Auth] Magic link for ${email}: ${url}`)
          console.info(`[Auth] Magic token for ${email}: ${token}`)
          return
        }

        const authIntentId = getAuthIntentIdFromMagicLinkUrl({
          magicLinkUrl: url,
          webUrl,
        })

        let authIntentContext: AuthIntentEmailContext | undefined

        if (authIntentId) {
          const authIntent = (await Effect.runPromise(authIntents.findById(authIntentId))) as AuthIntent | null

          if (authIntent) {
            authIntentContext = {
              type: authIntent.type,
              existingAccountAtRequest: authIntent.existingAccountAtRequest,
              ...(authIntent.data.signup?.name ? { signupName: authIntent.data.signup.name } : {}),
            }
          }
        }

        const normalizedEmail = normalizeEmail(email)

        const user = await Effect.runPromise(users.findByEmail(normalizedEmail))

        const allowsUnknownUser = authIntentContext
          ? authIntentContext.type === "signup" || authIntentContext.type === "invite"
          : false

        if (!user && !allowsUnknownUser) {
          throw new Error(`Cannot send magic link: user not found for email ${email}`)
        }

        const userName = user?.name ?? authIntentContext?.signupName ?? "there"
        const template = authIntentContext
          ? resolveMagicLinkEmailTemplateFromContext({
              type: authIntentContext.type,
              existingAccountAtRequest: authIntentContext.existingAccountAtRequest,
            })
          : "default"

        const html =
          template === "signupExistingAccount"
            ? await signupExistingAccountMagicLinkTemplate({ userName, magicLinkUrl: url })
            : await magicLinkTemplate({ userName, magicLinkUrl: url })

        const subject =
          template === "signupExistingAccount" ? "Sign in to your Latitude account" : "Your Latitude magic link"
        const text =
          template === "signupExistingAccount"
            ? `This email is already registered in Latitude. Use this secure link to sign in: ${url}`
            : `Use this link to sign in: ${url}`

        await Effect.runPromise(
          sendEmailUseCase({
            to: normalizedEmail,
            subject,
            html,
            text,
          }),
        )
      },
    })
  }

  const betterAuth = betterAuthInstance

  if (!betterAuth) {
    throw new Error("Better Auth is not initialized")
  }

  return betterAuth
}
