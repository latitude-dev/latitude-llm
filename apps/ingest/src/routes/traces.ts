import { checkCreditAvailabilityUseCase, NoCreditsRemainingError, resolveEffectivePlan } from "@domain/billing"
import { OrganizationId, ProjectId } from "@domain/shared"
import { ingestSpansUseCase } from "@domain/spans"
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
import { Effect, Layer } from "effect"
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

const traceIngestionBillingGate = (organizationId: string) =>
  Effect.gen(function* () {
    const organization = OrganizationId(organizationId)
    const plan = yield* resolveEffectivePlan(organization)
    const allowed = yield* checkCreditAvailabilityUseCase({
      organizationId: organization,
      action: "trace",
      planSlug: plan.plan.slug,
      periodStart: plan.periodStart,
      periodEnd: plan.periodEnd,
      includedCredits: plan.plan.includedCredits,
      hardCapped: plan.plan.hardCapped,
      priceCents: plan.plan.priceCents,
      spendingLimitCents: plan.plan.spendingLimitCents,
    })
    return { allowed, planSlug: plan.plan.slug }
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

    const organizationId = c.get("organizationId")
    const projectId = c.get("projectId")
    const apiKeyId = c.get("apiKeyId")

    const billingGate = await Effect.runPromise(
      traceIngestionBillingGate(organizationId).pipe(
        withPostgres(traceIngestionBillingLayers, getPostgresClient(), OrganizationId(organizationId)),
        withTracing,
      ),
    )

    if (!billingGate.allowed) {
      const denial = new NoCreditsRemainingError({
        organizationId,
        planSlug: billingGate.planSlug,
        action: "trace",
      })
      return c.json({ error: denial.httpMessage, _tag: denial._tag }, denial.httpStatus)
    }

    const disk = getStorageDisk()
    const publisher = await getQueuePublisher()

    await Effect.runPromise(
      ingestSpansUseCase({
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(projectId),
        apiKeyId,
        payload: new Uint8Array(body),
        contentType,
      }).pipe(Effect.provide(Layer.merge(StorageDiskLive(disk), QueuePublisherLive(publisher))), withTracing),
    )

    return c.json({}, 202)
  })
}
