import { checkCreditAvailabilityUseCase, NoCreditsRemainingError } from "@domain/billing"
import { OrganizationId, ProjectId } from "@domain/shared"
import { ingestSpansUseCase } from "@domain/spans"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  resolveEffectivePlanCached,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { QueuePublisherLive } from "@platform/queue-bullmq"
import { StorageDiskLive } from "@platform/storage-object"
import { createLogger, withTracing } from "@repo/observability"
import { Cause, Duration, Effect, Layer } from "effect"
import type { Hono } from "hono"
import { getPostgresClient, getQueuePublisher, getRedisClient, getStorageDisk } from "../clients.ts"
import { authMiddleware } from "../middleware/auth.ts"
import { projectMiddleware } from "../middleware/project.ts"
import { checkTraceIngestionRateLimit } from "../rate-limit/trace-ingestion.ts"
import type { IngestEnv } from "../types.ts"

interface TracesRouteContext {
  app: Hono<IngestEnv>
}

const logger = createLogger("ingest-traces")
const TRACE_INGESTION_BILLING_GATE_TIMEOUT_MS = 500

const traceIngestionBillingLayers = Layer.mergeAll(
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

const traceIngestionBillingGate = (organizationId: OrganizationId) =>
  Effect.gen(function* () {
    const plan = yield* resolveEffectivePlanCached(organizationId)
    const allowed = yield* checkCreditAvailabilityUseCase({
      organizationId,
      action: "trace",
      planSlug: plan.plan.slug,
      periodStart: plan.periodStart,
      periodEnd: plan.periodEnd,
      includedCredits: plan.plan.includedCredits,
      hardCapped: plan.plan.hardCapped,
      priceCents: plan.plan.priceCents,
      spendingLimitCents: plan.plan.spendingLimitCents,
    })

    if (!allowed) {
      return yield* Effect.fail(
        new NoCreditsRemainingError({
          organizationId,
          planSlug: plan.plan.slug,
          action: "trace",
        }),
      )
    }
  })

export const registerTracesRoute = ({ app }: TracesRouteContext) => {
  app.post("/v1/traces", authMiddleware, projectMiddleware, async (c) => {
    const contentType = c.req.header("Content-Type") ?? "application/json"
    const body = await c.req.arrayBuffer()
    if (!body.byteLength) return c.json({}, 202)

    const rateLimit = await checkTraceIngestionRateLimit({
      redis: getRedisClient(),
      organizationId: c.get("organizationId"),
      projectId: c.get("projectId"),
      apiKeyId: c.get("apiKeyId"),
      payloadBytes: body.byteLength,
    })

    if (!rateLimit.allowed) {
      const error =
        rateLimit.limitedBy === "bytes"
          ? "Trace ingestion volume exceeded. Please retry later."
          : "Too many trace ingestion requests. Please retry later."

      return c.json(
        {
          error,
          retryAfter: rateLimit.retryAfterSeconds,
        },
        429,
        { "Retry-After": String(rateLimit.retryAfterSeconds) },
      )
    }

    const organization = OrganizationId(c.get("organizationId"))
    const project = ProjectId(c.get("projectId"))
    const apiKeyId = c.get("apiKeyId")

    const disk = getStorageDisk()
    const publisher = await getQueuePublisher()
    const postgresClient = getPostgresClient()
    const redisClient = getRedisClient()

    const ingestionEffect = Effect.gen(function* () {
      yield* traceIngestionBillingGate(organization).pipe(
        Effect.timeout(Duration.millis(TRACE_INGESTION_BILLING_GATE_TIMEOUT_MS)),
        Effect.catchTag("TimeoutError", () =>
          Effect.sync(() => {
            logger.error("Trace ingestion billing gate degraded; failing open", {
              organizationId: organization,
            })
          }),
        ),
        withPostgres(traceIngestionBillingLayers, postgresClient, organization),
        Effect.provide(RedisCacheStoreLive(redisClient)),
      )

      yield* ingestSpansUseCase({
        organizationId: organization,
        projectId: project,
        apiKeyId,
        payload: new Uint8Array(body),
        contentType,
      })
    }).pipe(Effect.provide(Layer.merge(StorageDiskLive(disk), QueuePublisherLive(publisher))), withTracing)

    const exit = await Effect.runPromiseExit(ingestionEffect)

    if (exit._tag === "Failure") {
      const failure = Cause.findErrorOption(exit.cause)
      if (failure._tag === "Some" && failure.value instanceof NoCreditsRemainingError) {
        return c.json({ error: failure.value.httpMessage, _tag: failure.value._tag }, failure.value.httpStatus)
      }
      throw new Error(Cause.pretty(exit.cause))
    }

    return c.json({}, 202)
  })
}
