import {
  type AuthIntent,
  AuthIntentRepository,
  normalizeEmail,
  resolveMagicLinkEmailTemplateFromContext,
} from "@domain/auth"
import type { RenderedEmail } from "@domain/email"
import {
  inviteMagicLinkTemplate,
  magicLinkTemplate,
  sendEmail,
  signupExistingAccountMagicLinkTemplate,
} from "@domain/email"
import type { QueuePublisherShape } from "@domain/queue"
import type { StorageDiskPort } from "@domain/shared"
import { UserRepository } from "@domain/users"
import { createBetterAuth } from "@platform/auth-better"
import type { RedisClient } from "@platform/cache-redis"
import { createRedisClient, createRedisConnection } from "@platform/cache-redis"
import { type ClickHouseClient, createClickhouseClient } from "@platform/db-clickhouse"
import {
  AuthIntentRepositoryLive,
  createPostgresClient,
  type PostgresClient,
  SqlClientLive,
  UserRepositoryLive,
} from "@platform/db-postgres"
import { createEmailTransportSender } from "@platform/email-transport"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { createBullMqQueuePublisher, loadBullMqConfig } from "@platform/queue-bullmq"
import { createStorageDisk } from "@platform/storage-object"
import { Effect } from "effect"

let postgresClientInstance: PostgresClient | undefined
let adminPostgresClientInstance: PostgresClient | undefined
let redisClientInstance: RedisClient | undefined
let clickhouseClientInstance: ClickHouseClient | undefined
let betterAuthInstance: ReturnType<typeof createBetterAuth> | undefined
let storageDiskInstance: StorageDiskPort | undefined
let queuePublisher: Promise<QueuePublisherShape> | undefined

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

/**
 * Postgres client using the admin (superuser) connection.
 * Use this only for cross-org operations that must bypass RLS:
 * - API key auth lookups (token hash → org mapping)
 * - Touch buffer batch updates
 */
export const getAdminPostgresClient = (): PostgresClient => {
  if (!adminPostgresClientInstance) {
    const adminUrl = Effect.runSync(parseEnv("LAT_ADMIN_DATABASE_URL", "string"))
    adminPostgresClientInstance = createPostgresClient({ databaseUrl: adminUrl })
  }
  return adminPostgresClientInstance
}

export const getPostgresClient = (): PostgresClient => {
  if (!postgresClientInstance) {
    postgresClientInstance = createPostgresClient()
  }
  return postgresClientInstance
}

export const getRedisClient = (): RedisClient => {
  if (!redisClientInstance) {
    const connection = createRedisConnection()
    redisClientInstance = createRedisClient(connection)
  }
  return redisClientInstance
}

export const getClickhouseClient = (): ClickHouseClient => {
  if (!clickhouseClientInstance) {
    clickhouseClientInstance = createClickhouseClient()
  }
  return clickhouseClientInstance
}

export const getStorageDisk = (): StorageDiskPort => {
  if (!storageDiskInstance) {
    storageDiskInstance = createStorageDisk()
  }
  return storageDiskInstance
}

export const getQueuePublisher = (): Promise<QueuePublisherShape> => {
  if (!queuePublisher) {
    queuePublisher = (async () => {
      const config = Effect.runSync(loadBullMqConfig())
      return Effect.runPromise(createBullMqQueuePublisher({ redis: config }))
    })().catch((error) => {
      queuePublisher = undefined
      throw error
    })
  }
  return queuePublisher
}

export const getBetterAuth = () => {
  if (!betterAuthInstance) {
    const adminClient = getAdminPostgresClient()
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

    betterAuthInstance = createBetterAuth({
      client: adminClient,
      secret: betterAuthSecret,
      baseUrl: webUrl,
      basePath: "/api/auth",
      trustedOrigins,
      enableTanStackCookies: true,
      sendMagicLink: async ({ email, url }) => {
        const authIntentId = getAuthIntentIdFromMagicLinkUrl({
          magicLinkUrl: url,
          webUrl,
        })

        let authIntentContext: AuthIntentEmailContext | undefined
        const adminClient = getAdminPostgresClient()

        if (authIntentId) {
          const authIntent = await Effect.runPromise(
            Effect.gen(function* () {
              const repo = yield* AuthIntentRepository
              return yield* repo
                .findById(authIntentId)
                .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
            }).pipe(Effect.provide(AuthIntentRepositoryLive), Effect.provide(SqlClientLive(adminClient))),
          )

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

        const user = await Effect.runPromise(
          Effect.gen(function* () {
            const repo = yield* UserRepository
            return yield* repo
              .findByEmail(normalizedEmail)
              .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
          }).pipe(Effect.provide(UserRepositoryLive), Effect.provide(SqlClientLive(adminClient))),
        )

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

  return betterAuthInstance
}
