import { PRO_PLAN_CONFIG, SELF_SERVE_PLAN_SLUGS } from "@domain/billing"
import type { QueuePublisherShape, WorkflowQuerierShape, WorkflowStarterShape } from "@domain/queue"
import { generateId, type StorageDiskPort } from "@domain/shared"
import { createRedisClient, createRedisConnection, type RedisClient } from "@platform/cache-redis"
import { type ClickHouseClient, createClickhouseClient } from "@platform/db-clickhouse"
import {
  createBetterAuth,
  createOutboxWriter,
  createPostgresClient,
  type PostgresClient,
  SqlClientLive,
  type StripePlanConfig,
} from "@platform/db-postgres"
import { createWeaviateClient, type WeaviateClient } from "@platform/db-weaviate"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { createBullMqQueuePublisher, loadBullMqConfig } from "@platform/queue-bullmq"
import { createStorageDisk } from "@platform/storage-object"
import {
  createTemporalClient,
  createWorkflowQuerier,
  createWorkflowStarter,
  loadTemporalConfig,
} from "@platform/workflows-temporal"
import { withTracing } from "@repo/observability"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { Effect } from "effect"

let postgresClientInstance: PostgresClient | undefined
let adminPostgresClientInstance: PostgresClient | undefined
let clickhouseClientInstance: ClickHouseClient | undefined
let weaviateClientInstancePromise: Promise<WeaviateClient> | undefined
let betterAuthInstance: ReturnType<typeof createBetterAuth> | undefined
let storageDiskInstance: StorageDiskPort | undefined
let queuePublisher: Promise<QueuePublisherShape> | undefined
let outboxWriterInstance: ReturnType<typeof createOutboxWriter> | undefined
let redisInstance: RedisClient | undefined
let temporalClientPromise: ReturnType<typeof createTemporalClient> | undefined
let workflowStarterPromise: Promise<WorkflowStarterShape> | undefined
let workflowQuerierPromise: Promise<WorkflowQuerierShape> | undefined

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

export const getWeaviateClient = (): Promise<WeaviateClient> => {
  if (!weaviateClientInstancePromise) {
    weaviateClientInstancePromise = createWeaviateClient()
  }
  return weaviateClientInstancePromise
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
      return Effect.runPromise(createBullMqQueuePublisher({ redis: config }).pipe(withTracing))
    })().catch((error) => {
      queuePublisher = undefined
      throw error
    })
  }
  return queuePublisher
}

const getTemporalClient = (): ReturnType<typeof createTemporalClient> => {
  if (!temporalClientPromise) {
    const config = loadTemporalConfig()
    temporalClientPromise = createTemporalClient(config).catch((error) => {
      temporalClientPromise = undefined
      throw error
    })
  }
  return temporalClientPromise
}

export function getWorkflowStarter(): Promise<WorkflowStarterShape> {
  if (!workflowStarterPromise) {
    const config = loadTemporalConfig()
    workflowStarterPromise = getTemporalClient()
      .then((client) => createWorkflowStarter(client, config))
      .catch((error) => {
        workflowStarterPromise = undefined
        throw error
      })
  }
  return workflowStarterPromise
}

export function getWorkflowQuerier(): Promise<WorkflowQuerierShape> {
  if (!workflowQuerierPromise) {
    workflowQuerierPromise = getTemporalClient()
      .then((client) => createWorkflowQuerier(client))
      .catch((error) => {
        workflowQuerierPromise = undefined
        throw error
      })
  }
  return workflowQuerierPromise
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

    const captchaSecretKey = Effect.runSync(parseEnvOptional("LAT_TURNSTILE_SECRET_KEY", "string"))
    const allowedEmailDomain = Effect.runSync(parseEnvOptional("LAT_ALLOWED_EMAIL_DOMAIN", "string"))
    const stripeSecretKey = Effect.runSync(parseEnvOptional("LAT_STRIPE_SECRET_KEY", "string"))
    const stripeProPriceId = Effect.runSync(parseEnvOptional("LAT_STRIPE_PRO_PRICE_ID", "string"))
    const stripeWebhookSecret = Effect.runSync(parseEnvOptional("LAT_STRIPE_WEBHOOK_SECRET", "string"))
    const outboxWriter = getOutboxWriter()

    const selfServePlans: StripePlanConfig[] = SELF_SERVE_PLAN_SLUGS.flatMap((slug) => {
      if (slug === "pro" && stripeProPriceId) {
        return [
          {
            name: slug,
            priceId: stripeProPriceId,
            limits: {
              credits: PRO_PLAN_CONFIG.includedCredits,
              retentionDays: PRO_PLAN_CONFIG.retentionDays,
            },
          },
        ]
      }

      return []
    })

    betterAuthInstance = createBetterAuth({
      client: adminClient,
      secret: betterAuthSecret,
      baseUrl: webUrl,
      basePath: "/api/auth",
      trustedOrigins,
      ...(captchaSecretKey ? { captchaSecretKey } : {}),
      ...(allowedEmailDomain ? { allowedEmailDomain } : {}),
      ...(stripeSecretKey ? { stripeSecretKey } : {}),
      ...(stripeWebhookSecret ? { stripeWebhookSecret } : {}),
      ...(selfServePlans.length > 0 ? { subscriptionPlans: selfServePlans } : {}),
      extraPlugins: [tanstackStartCookies()],
      onUserCreated: async (user) => {
        await Effect.runPromise(
          outboxWriter
            .write({
              eventName: "UserSignedUp",
              aggregateType: "user",
              aggregateId: user.id,
              organizationId: "system",
              payload: { userId: user.id, email: user.email },
            })
            .pipe(Effect.provide(SqlClientLive(getAdminPostgresClient())), withTracing),
        )
      },
      onMemberCreated: async (member) => {
        await Effect.runPromise(
          outboxWriter
            .write({
              eventName: "MemberJoined",
              aggregateType: "member",
              aggregateId: member.userId,
              organizationId: member.organizationId,
              payload: {
                organizationId: member.organizationId,
                userId: member.userId,
                role: member.role,
              },
            })
            .pipe(Effect.provide(SqlClientLive(getAdminPostgresClient())), withTracing),
        )
      },
      sendMagicLink: async ({ email, url }) => {
        await Effect.runPromise(
          outboxWriter
            .write({
              eventName: "MagicLinkEmailRequested",
              aggregateType: "email_request",
              aggregateId: generateId(),
              organizationId: "system",
              payload: {
                email,
                magicLinkUrl: url,
                organizationId: "system",
              },
            })
            .pipe(Effect.provide(SqlClientLive(getAdminPostgresClient())), withTracing),
        )
      },
      sendInvitationEmail: async (data) => {
        const inviterName =
          typeof data.inviter.user.name === "string" && data.inviter.user.name.trim().length > 0
            ? data.inviter.user.name.trim()
            : "A teammate"
        await Effect.runPromise(
          outboxWriter
            .write({
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
            })
            .pipe(Effect.provide(SqlClientLive(getAdminPostgresClient())), withTracing),
        )
        await Effect.runPromise(
          outboxWriter
            .write({
              eventName: "MemberInvited",
              aggregateType: "invitation",
              aggregateId: data.id,
              organizationId: "system",
              payload: {
                organizationId: "system",
                actorUserId: data.inviter.user.id,
                email: data.email,
                role: data.role,
              },
            })
            .pipe(Effect.provide(SqlClientLive(getAdminPostgresClient())), withTracing),
        )
      },
    })
  }

  return betterAuthInstance
}
