import type { QueuePublisherShape } from "@domain/queue"
import { generateId, type StorageDiskPort } from "@domain/shared"
import { createBetterAuth } from "@platform/auth-better"
import type { RedisClient } from "@platform/cache-redis"
import { createRedisClient, createRedisConnection } from "@platform/cache-redis"
import { type ClickHouseClient, createClickhouseClient } from "@platform/db-clickhouse"
import { createOutboxWriter, createPostgresClient, type PostgresClient } from "@platform/db-postgres"
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

    const outboxWriter = createOutboxWriter(adminClient)

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

        await outboxWriter.write({
          id: generateId(),
          eventName: "MagicLinkEmailRequested",
          aggregateId: authIntentId ?? generateId(),
          organizationId: "system",
          payload: { email, magicLinkUrl: url, authIntentId },
          occurredAt: new Date(),
        })
      },
    })
  }

  return betterAuthInstance
}
