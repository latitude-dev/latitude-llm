import { type AuthIntent, normalizeEmail, resolveMagicLinkEmailTemplateFromContext } from "@domain/auth"
import type { RenderedEmail } from "@domain/email"
import {
  inviteMagicLinkTemplate,
  magicLinkTemplate,
  sendEmail,
  signupExistingAccountMagicLinkTemplate,
} from "@domain/email"
import { createBetterAuth } from "@platform/auth-better"
import {
  type PostgresClient,
  createAuthIntentPostgresRepository,
  createAuthUserPostgresRepository,
  createPostgresClient,
} from "@platform/db-postgres"
import { createEmailTransportSender } from "@platform/email-transport"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

let postgresClientInstance: PostgresClient | undefined
let betterAuthInstance: ReturnType<typeof createBetterAuth> | undefined

interface AuthIntentEmailContext {
  readonly type: AuthIntent["type"]
  readonly existingAccountAtRequest: boolean
  readonly signupName?: string
  readonly inviterName?: string
  readonly organizationName?: string
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

export const getPostgresClient = (): PostgresClient => {
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

    const emailSender = createEmailTransportSender()
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
        const authIntentId = getAuthIntentIdFromMagicLinkUrl({
          magicLinkUrl: url,
          webUrl,
        })

        let authIntentContext: AuthIntentEmailContext | undefined

        if (authIntentId) {
          const authIntent = await Effect.runPromise(authIntents.findById(authIntentId))

          if (authIntent) {
            authIntentContext = {
              type: authIntent.type,
              existingAccountAtRequest: authIntent.existingAccountAtRequest,
              ...(authIntent.data.signup?.name ? { signupName: authIntent.data.signup.name } : {}),
              ...(authIntent.data.invite?.inviterName ? { inviterName: authIntent.data.invite.inviterName } : {}),
              ...(authIntent.data.invite?.organizationName
                ? { organizationName: authIntent.data.invite.organizationName }
                : {}),
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

        let rendered: RenderedEmail

        if (template === "invite") {
          rendered = await inviteMagicLinkTemplate({
            inviterName: authIntentContext?.inviterName ?? "Someone",
            organizationName: authIntentContext?.organizationName ?? "a workspace",
            magicLinkUrl: url,
          })
        } else if (template === "signupExistingAccount") {
          rendered = await signupExistingAccountMagicLinkTemplate({ userName, magicLinkUrl: url })
        } else {
          rendered = await magicLinkTemplate({ userName, magicLinkUrl: url })
        }

        await Effect.runPromise(
          sendEmailUseCase({
            to: normalizedEmail,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
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
