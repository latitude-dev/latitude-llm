import { NoCreditsRemainingError } from "@domain/billing"
import { SandboxArchivedError, SandboxQuotaExceededError } from "@domain/sandboxes"
import { OrganizationId } from "@domain/shared"
import { type IngestSpansResult, ingestSpansWithBillingUseCase } from "@domain/spans"
import { RedisCacheStoreLive, SandboxSignalsLive } from "@platform/cache-redis"
import {
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  ProjectRepositoryLive,
  resolveOrganizationRedactionCached,
  SandboxRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { QueuePublisherLive } from "@platform/queue-bullmq"
import { StorageDiskLive } from "@platform/storage-object"
import { withTracing } from "@repo/observability"
import { Cause, Effect, Exit, Layer, Option } from "effect"
import type { Context, Handler, Hono } from "hono"
import { getPostgresClient, getQueuePublisher, getRedisClient, getStorageDisk } from "../clients.ts"
import { authMiddleware } from "../middleware/auth.ts"
import { projectMiddleware } from "../middleware/project.ts"
import { checkTraceIngestionRateLimit } from "../rate-limit/trace-ingestion.ts"
import type { TracePayloadProtection } from "../trace-payload.ts"
import type { IngestEnv } from "../types.ts"

interface TracesRouteContext {
  app: Hono<IngestEnv>
  tracePayloadProtection: TracePayloadProtection
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

type RateLimitedTraceResult = {
  readonly limitedBy: "requests" | "bytes"
  readonly retryAfterSeconds: number
}

const rateLimitedTraceResponse = (c: Context<IngestEnv>, rateLimit: RateLimitedTraceResult) => {
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

const runTraceIngestion = async ({
  organization,
  apiKeyId,
  isSandbox,
  payload,
  contentType,
  defaultProjectSlug,
}: {
  organization: ReturnType<typeof OrganizationId>
  apiKeyId: string
  isSandbox: boolean
  payload: Uint8Array
  contentType: string
  defaultProjectSlug?: string | undefined
}) => {
  const disk = getStorageDisk()
  const publisher = await getQueuePublisher()
  const postgresClient = getPostgresClient()
  // The org half of the redaction cascade is read here, not in the domain: the
  // cached resolver is a platform concern. The project half is free downstream,
  // where project settings are already loaded for sampling.
  return Effect.gen(function* () {
    const organizationRedaction = yield* resolveOrganizationRedactionCached(organization)

    return yield* ingestSpansWithBillingUseCase({
      organizationId: organization,
      apiKeyId,
      isSandbox,
      payload,
      contentType,
      organizationRedaction,
      ...(defaultProjectSlug ? { defaultProjectSlug } : {}),
    })
  }).pipe(
    withPostgres(traceIngestionBillingLayers, postgresClient, organization),
    Effect.provide(
      Layer.mergeAll(
        StorageDiskLive(disk),
        QueuePublisherLive(publisher),
        SandboxSignalsLive(getRedisClient()),
        RedisCacheStoreLive(getRedisClient()),
      ),
    ),
    withTracing,
  )
}

const mappedIngestionFailureResponse = (c: Context<IngestEnv>, cause: Cause.Cause<unknown>) => {
  const failure = Cause.findErrorOption(cause)
  if (Option.isNone(failure)) return undefined

  const err = failure.value
  if (err instanceof NoCreditsRemainingError) {
    return c.json({ error: err.httpMessage, kind: "NoCreditsRemaining" }, err.httpStatus)
  }
  if (err instanceof SandboxArchivedError) {
    return c.json({ error: err.httpMessage, kind: "SandboxArchived" }, err.httpStatus)
  }
  if (err instanceof SandboxQuotaExceededError) {
    return c.json({ error: err.httpMessage, kind: "SandboxQuotaExceeded" }, err.httpStatus)
  }
  if ((err as { _tag?: string })._tag === "SpanDecodingError") {
    const decoding = err as { httpMessage?: string }
    return c.json({ error: decoding.httpMessage ?? "Invalid OTLP payload" }, 400)
  }
  return undefined
}

const traceIngestionSuccessResponse = (c: Context<IngestEnv>, result: IngestSpansResult) => {
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
}

export const registerTracesRoute = ({ app, tracePayloadProtection }: TracesRouteContext) => {
  const handleTraceRequest: Handler<IngestEnv> = async (c) => {
    const { payload: body, contentType } = c.get("tracePayload")
    if (!body.byteLength) return c.json({}, 202)

    const organizationId = c.get("organizationId")
    const isSandbox = c.get("isSandbox")

    const rateLimit = await checkTraceIngestionRateLimit({
      redis: getRedisClient(),
      organizationId,
      apiKeyId: c.get("apiKeyId"),
      payloadBytes: body.byteLength,
      isSandbox,
    })
    if (!rateLimit.allowed) return rateLimitedTraceResponse(c, rateLimit)

    const exit = await Effect.runPromiseExit(
      await runTraceIngestion({
        organization: OrganizationId(organizationId),
        apiKeyId: c.get("apiKeyId"),
        isSandbox,
        payload: body,
        contentType,
        defaultProjectSlug: c.get("defaultProjectSlug"),
      }),
    )

    if (Exit.isFailure(exit)) {
      const mapped = mappedIngestionFailureResponse(c, exit.cause)
      if (mapped) return mapped
      throw new Error(Cause.pretty(exit.cause))
    }

    return traceIngestionSuccessResponse(c, exit.value)
  }

  app.post(
    "/v1/traces",
    tracePayloadProtection.rejectOversizedHeaders,
    authMiddleware,
    projectMiddleware,
    tracePayloadProtection.readPayload,
    handleTraceRequest,
  )
}
