import type { QueuePublisherShape } from "@domain/queue"
import { generateId, type StorageDiskPort } from "@domain/shared"
import { type ClickHouseClient, createClickhouseClient } from "@platform/db-clickhouse"
import { createBetterAuth, createOutboxWriter, createPostgresClient, type PostgresClient } from "@platform/db-postgres"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { createBullMqQueuePublisher, loadBullMqConfig } from "@platform/queue-bullmq"
import { createStorageDisk } from "@platform/storage-object"
import { Effect } from "effect"

let postgresClientInstance: PostgresClient | undefined
let adminPostgresClientInstance: PostgresClient | undefined
let clickhouseClientInstance: ClickHouseClient | undefined
let betterAuthInstance: ReturnType<typeof createBetterAuth> | undefined
let storageDiskInstance: StorageDiskPort | undefined
let queuePublisher: Promise<QueuePublisherShape> | undefined
let outboxWriterInstance: ReturnType<typeof createOutboxWriter> | undefined

const getInvitationInfoFromMagicLinkUrl = ({
  magicLinkUrl,
  webUrl,
}: {
  magicLinkUrl: string
  webUrl: string
}): {
  invitationId: string | null
  organizationName: string | null
  emailFlow: "signin" | "signup" | null
} => {
  const parsedMagicLinkUrl = new URL(magicLinkUrl)
  const callbackUrl = parsedMagicLinkUrl.searchParams.get("callbackURL")

  if (!callbackUrl) {
    return { invitationId: null, organizationName: null, emailFlow: null }
  }

  const parsedCallbackUrl = new URL(callbackUrl, webUrl)
  const invitationId = parsedCallbackUrl.searchParams.get("invitationId")
  const workspaceName = parsedCallbackUrl.searchParams.get("workspaceName")
  const emailFlowRaw = parsedCallbackUrl.searchParams.get("emailFlow")
  const emailFlow = emailFlowRaw === "signin" || emailFlowRaw === "signup" ? emailFlowRaw : null
  return {
    invitationId,
    organizationName: workspaceName,
    emailFlow,
  }
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
      enableTanStackCookies: true,
      sendMagicLink: async ({ email, url }) => {
        const invitationInfo = getInvitationInfoFromMagicLinkUrl({
          magicLinkUrl: url,
          webUrl,
        })
        const aggregateId = invitationInfo.invitationId ?? generateId()

        await outboxWriter.write({
          eventName: "MagicLinkEmailRequested",
          aggregateId,
          organizationId: "system",
          payload: {
            email,
            magicLinkUrl: url,
            invitationId: invitationInfo.invitationId,
            organizationId: "system",
            organizationName: invitationInfo.organizationName ?? "",
            inviterName: null,
            emailFlow: invitationInfo.emailFlow,
          },
        })
      },
      sendInvitationEmail: async (data) => {
        const inviterName =
          typeof data.inviter.user.name === "string" && data.inviter.user.name.trim().length > 0
            ? data.inviter.user.name.trim()
            : "A teammate"
        await outboxWriter.write({
          eventName: "MagicLinkEmailRequested",
          aggregateId: data.id,
          organizationId: "system",
          payload: {
            email: data.email,
            magicLinkUrl: `${webUrl}/auth/invite?invitationId=${encodeURIComponent(data.id)}`,
            invitationId: data.id,
            organizationId: "system",
            organizationName: data.organization.name,
            inviterName,
            emailFlow: null,
          },
          occurredAt: new Date(),
        })
      },
    })
  }

  return betterAuthInstance
}
