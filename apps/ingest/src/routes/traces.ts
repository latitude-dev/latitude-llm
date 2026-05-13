import { NoCreditsRemainingError } from "@domain/billing"
import { OrganizationId, ProjectId } from "@domain/shared"
import { ingestSpansWithBillingUseCase } from "@domain/spans"
import {
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
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
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

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
    const ingestionEffect = Effect.gen(function* () {
      yield* ingestSpansWithBillingUseCase({
        organizationId: organization,
        projectId: project,
        apiKeyId,
        payload: new Uint8Array(body),
        contentType,
      })
    }).pipe(
      withPostgres(traceIngestionBillingLayers, postgresClient, organization),
      Effect.provide(Layer.mergeAll(StorageDiskLive(disk), QueuePublisherLive(publisher))),
      withTracing,
    )

    const exit = await Effect.runPromiseExit(ingestionEffect)

    if (Exit.isFailure(exit)) {
      const failure = Cause.findErrorOption(exit.cause)
      if (Option.isSome(failure) && failure.value instanceof NoCreditsRemainingError) {
        const err = failure.value
        return c.json({ error: err.httpMessage, kind: "NoCreditsRemaining" }, err.httpStatus)
      }
      throw new Error(Cause.pretty(exit.cause))
    }

    return c.json({}, 202)
  })
}
