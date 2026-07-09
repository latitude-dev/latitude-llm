import { NoCreditsRemainingError } from "@domain/billing"
import { ingestElevenlabsWebhookUseCase } from "@domain/elevenlabs"
import { SandboxArchivedError, SandboxQuotaExceededError } from "@domain/sandboxes"
import { SandboxSignalsLive } from "@platform/cache-redis"
import {
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  findActiveElevenlabsWebhookEndpointByToken,
  getEncryptionKey,
  OrganizationRepositoryLive,
  ProjectRepositoryLive,
  SandboxRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { QueuePublisherLive } from "@platform/queue-bullmq"
import { StorageDiskLive } from "@platform/storage-object"
import { withTracing } from "@repo/observability"
import { Cause, Effect, Exit, Layer, Option } from "effect"
import type { Hono } from "hono"
import {
  getAdminPostgresClient,
  getPostgresClient,
  getQueuePublisher,
  getRedisClient,
  getStorageDisk,
} from "../clients.ts"
import type { IngestEnv } from "../types.ts"

interface ElevenlabsWebhookRouteContext {
  app: Hono<IngestEnv>
}

const webhookIngestionLayers = Layer.mergeAll(
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OrganizationRepositoryLive,
  ProjectRepositoryLive,
  SandboxRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

export const registerElevenlabsWebhookRoute = ({ app }: ElevenlabsWebhookRouteContext) => {
  app.post("/v1/webhooks/elevenlabs/:webhookToken", async (c) => {
    const webhookToken = c.req.param("webhookToken")
    const rawBody = await c.req.text()
    const signature = c.req.header("ElevenLabs-Signature") ?? c.req.header("elevenlabs-signature")

    const adminClient = getAdminPostgresClient()
    const encryptionKey = await Effect.runPromise(getEncryptionKey())
    const endpoint = await Effect.runPromise(
      findActiveElevenlabsWebhookEndpointByToken(adminClient.db, webhookToken, new Uint8Array(encryptionKey)).pipe(
        withTracing,
      ),
    )

    if (!endpoint) {
      return c.json({ error: "Webhook endpoint not found" }, 404)
    }

    const postgresClient = getPostgresClient()
    const ingestionEffect = ingestElevenlabsWebhookUseCase({
      endpoint,
      signature,
      rawBody,
    }).pipe(
      withPostgres(webhookIngestionLayers, postgresClient, endpoint.organizationId),
      Effect.provide(
        Layer.mergeAll(
          StorageDiskLive(getStorageDisk()),
          QueuePublisherLive(await getQueuePublisher()),
          SandboxSignalsLive(getRedisClient()),
        ),
      ),
      withTracing,
    )

    const exit = await Effect.runPromiseExit(ingestionEffect)

    if (Exit.isFailure(exit)) {
      const failure = Cause.findErrorOption(exit.cause)
      if (Option.isSome(failure) && (failure.value as { _tag?: string })._tag === "InvalidElevenlabsSignatureError") {
        return c.json({ error: "Invalid signature" }, 401)
      }
      if (
        Option.isSome(failure) &&
        (failure.value as { _tag?: string })._tag === "InvalidElevenlabsWebhookPayloadError"
      ) {
        return c.json({ error: "Unsupported webhook payload" }, 400)
      }
      if (Option.isSome(failure) && failure.value instanceof NoCreditsRemainingError) {
        const err = failure.value
        return c.json({ error: err.httpMessage, kind: "NoCreditsRemaining" }, err.httpStatus)
      }
      if (Option.isSome(failure) && failure.value instanceof SandboxArchivedError) {
        const err = failure.value
        return c.json({ error: err.httpMessage, kind: "SandboxArchived" }, err.httpStatus)
      }
      if (Option.isSome(failure) && failure.value instanceof SandboxQuotaExceededError) {
        const err = failure.value
        return c.json({ error: err.httpMessage, kind: "SandboxQuotaExceeded" }, err.httpStatus)
      }
      throw new Error(Cause.pretty(exit.cause))
    }

    return c.json({ received: true, acceptedSpans: exit.value.acceptedSpans })
  })
}
