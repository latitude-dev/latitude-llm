import type { QueuePublisherShape, WorkflowStarterShape } from "@domain/queue"
import { generateId, type StorageDiskPort } from "@domain/shared"
import { createRedisClient, createRedisConnection, type RedisClient } from "@platform/cache-redis"
import { type ClickHouseClient, createClickhouseClient } from "@platform/db-clickhouse"
import { createBetterAuth, createOutboxWriter, createPostgresClient, type PostgresClient } from "@platform/db-postgres"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { createBullMqQueuePublisher, loadBullMqConfig } from "@platform/queue-bullmq"
import { createStorageDisk } from "@platform/storage-object"
import { createTemporalClient, createWorkflowStarter, loadTemporalConfig } from "@platform/workflows-temporal"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { Effect } from "effect"

let postgresClientInstance: PostgresClient | undefined
let adminPostgresClientInstance: PostgresClient | undefined
let clickhouseClientInstance: ClickHouseClient | undefined
let betterAuthInstance: ReturnType<typeof createBetterAuth> | undefined
let storageDiskInstance: StorageDiskPort | undefined
let queuePublisher: Promise<QueuePublisherShape> | undefined
let outboxWriterInstance: ReturnType<typeof createOutboxWriter> | undefined
let redisInstance: RedisClient | undefined
let workflowStarterPromise: Promise<WorkflowStarterShape> | undefined

const getEmailFlowFromMagicLinkUrl = ({
  magicLinkUrl,
  webUrl,
}: {
  magicLinkUrl: string
  webUrl: string
}): "signin" | "signup" | null => {
  const parsedMagicLinkUrl = new URL(magicLinkUrl)
  const callbackUrl = parsedMagicLinkUrl.searchParams.get("callbackURL")

  if (!callbackUrl) return null

  const parsedCallbackUrl = new URL(callbackUrl, webUrl)
  const emailFlowRaw = parsedCallbackUrl.searchParams.get("emailFlow")
  return emailFlowRaw === "signin" || emailFlowRaw === "signup" ? emailFlowRaw : null
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

export const getRedisClient = (): RedisClient => {
  if (!redisInstance) {
    const redisConn = createRedisConnection()
    redisInstance = createRedisClient(redisConn)
  }
  return redisInstance
}

export const getOutboxWriter = (): ReturnType<typeof createOutboxWriter> => {
  if (!outboxWriterInstance) {
    outboxWriterInstance = createOutboxWriter(getAdminPostgresClient())
  }
  return outboxWriterInstance
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

export function getWorkflowStarter(): Promise<WorkflowStarterShape> {
  if (!workflowStarterPromise) {
    const config = loadTemporalConfig()
    workflowStarterPromise = createTemporalClient(config).then((client) => createWorkflowStarter(client, config))
  }
  return workflowStarterPromise
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

    const outboxWriter = getOutboxWriter()

    betterAuthInstance = createBetterAuth({
      client: adminClient,
      secret: betterAuthSecret,
      baseUrl: webUrl,
      basePath: "/api/auth",
      trustedOrigins,
      extraPlugins: [tanstackStartCookies()],
      sendMagicLink: async ({ email, url }) => {
        const emailFlow = getEmailFlowFromMagicLinkUrl({ magicLinkUrl: url, webUrl })

        await Effect.runPromise(
          outboxWriter.write({
            eventName: "MagicLinkEmailRequested",
            aggregateType: "email_request",
            aggregateId: generateId(),
            organizationId: "system",
            payload: {
              email,
              magicLinkUrl: url,
              organizationId: "system",
              emailFlow,
            },
          }),
        )
      },
      sendInvitationEmail: async (data) => {
        const inviterName =
          typeof data.inviter.user.name === "string" && data.inviter.user.name.trim().length > 0
            ? data.inviter.user.name.trim()
            : "A teammate"
        await Effect.runPromise(
          outboxWriter.write({
            eventName: "InvitationEmailRequested",
            aggregateType: "invitation",
            aggregateId: data.id,
            organizationId: "system",
            payload: {
              email: data.email,
              invitationUrl: `${webUrl}/auth/invite?invitationId=${encodeURIComponent(data.id)}`,
              organizationId: "system",
              organizationName: data.organization.name,
              inviterName,
            },
            occurredAt: new Date(),
          }),
        )
      },
    })
  }

  return betterAuthInstance
}
