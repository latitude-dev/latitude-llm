import { NoCreditsRemainingError } from "@domain/billing"
import { SandboxArchivedError, SandboxQuotaExceededError } from "@domain/sandboxes"
import { OrganizationId } from "@domain/shared"
import { ingestSpansWithBillingUseCase } from "@domain/spans"
import { SandboxSignalsLive } from "@platform/cache-redis"
import {
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
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
import { getPostgresClient, getQueuePublisher, getRedisClient, getStorageDisk } from "../clients.ts"
import { authMiddleware } from "../middleware/auth.ts"
import { projectMiddleware } from "../middleware/project.ts"
import { checkTraceIngestionRateLimit } from "../rate-limit/trace-ingestion.ts"
import type { IngestEnv } from "../types.ts"

interface TracesRouteContext {
  app: Hono<IngestEnv>
}

const traceIngestionBillingLayers = Layer.mergeAll(
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  ProjectRepositoryLive,
  SandboxRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

const buildRejectionMessage = (rejected: number): string =>
  `${rejected} span(s) rejected: no project could be resolved. ` +
  "Set a valid project slug with the `latitude.project` span attribute, the `latitude.project` " +
  "OTEL resource attribute, or the `X-Latitude-Project` export header. If you already set one, " +
  "check that the slug exists in this Latitude organization."

export const registerTracesRoute = ({ app }: TracesRouteContext) => {
  app.post("/v1/traces", authMiddleware, projectMiddleware, async (c) => {
    const contentType = c.req.header("Content-Type") ?? "application/json"
    const body = await c.req.arrayBuffer()
    if (!body.byteLength) return c.json({}, 202)

    const rateLimit = await checkTraceIngestionRateLimit({
      redis: getRedisClient(),
      organizationId: c.get("organizationId"),
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
    const apiKeyId = c.get("apiKeyId")
    const isSandbox = c.get("isSandbox")
    const defaultProjectSlug = c.get("defaultProjectSlug")

    const disk = getStorageDisk()
    const publisher = await getQueuePublisher()
    const postgresClient = getPostgresClient()
    const ingestionEffect = ingestSpansWithBillingUseCase({
      organizationId: organization,
      apiKeyId,
      isSandbox,
      payload: new Uint8Array(body),
      contentType,
      ...(defaultProjectSlug ? { defaultProjectSlug } : {}),
    }).pipe(
      withPostgres(traceIngestionBillingLayers, postgresClient, organization),
      Effect.provide(
        Layer.mergeAll(StorageDiskLive(disk), QueuePublisherLive(publisher), SandboxSignalsLive(getRedisClient())),
      ),
      withTracing,
    )

    const exit = await Effect.runPromiseExit(ingestionEffect)

    if (Exit.isFailure(exit)) {
      const failure = Cause.findErrorOption(exit.cause)
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
      if (Option.isSome(failure) && (failure.value as { _tag?: string })._tag === "SpanDecodingError") {
        const err = failure.value as { httpMessage?: string }
        return c.json({ error: err.httpMessage ?? "Invalid OTLP payload" }, 400)
      }
      throw new Error(Cause.pretty(exit.cause))
    }

    const result = exit.value

    // OTLP response contract:
    //  - All-valid batch                   → 200 OK, empty `ExportTraceServiceResponse`
    //  - Mixed (some rejected, some kept)  → 200 OK + `partialSuccess { rejectedSpans, errorMessage }`
    //    (spec §3.2: `partialSuccess` ONLY belongs on 2xx — it conveys "we kept some")
    //  - Empty batch (no spans to ingest)  → 202 Accepted (legacy no-op, OTLP-permissive)
    //  - All rejected                      → 400 with a `google.rpc.Status`-shaped body
    //    ({ code, message }) — NOT `partialSuccess`, since nothing was persisted
    if (result.totalSpans === 0) {
      return c.json({}, 202)
    }

    if (result.acceptedSpans === 0) {
      return c.json({ code: 400, message: buildRejectionMessage(result.rejectedSpans) }, 400)
    }

    if (result.rejectedSpans > 0) {
      return c.json({
        partialSuccess: {
          rejectedSpans: result.rejectedSpans,
          errorMessage: buildRejectionMessage(result.rejectedSpans),
        },
      })
    }

    return c.json({})
  })
}
