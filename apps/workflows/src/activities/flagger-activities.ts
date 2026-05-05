import { buildBillingIdempotencyKey, meterBillableAction } from "@domain/billing"
import {
  draftFlaggerAnnotationUseCase,
  type FlaggerAnnotateOutput,
  type RunFlaggerResult,
  runFlaggerUseCase,
  saveFlaggerAnnotationUseCase,
} from "@domain/flaggers"
import { QueuePublisher } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import { AIEmbedLive } from "@platform/ai-voyage"
import {
  ScoreAnalyticsRepositoryLive,
  SpanRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OutboxEventWriterLive,
  ScoreRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getQueuePublisher, getRedisClient } from "../clients.ts"

const logger = createLogger("workflows-flagger")

export const runFlagger = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly flaggerSlug: string
}): Promise<RunFlaggerResult> =>
  Effect.runPromise(
    runFlaggerUseCase(input).pipe(
      withClickHouse(TraceRepositoryLive, getClickhouseClient(), OrganizationId(input.organizationId)),
      withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), getRedisClient()),
      withTracing,
      Effect.tap(() =>
        Effect.sync(() =>
          logger.info("Ran flagger", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            traceId: input.traceId,
            flaggerSlug: input.flaggerSlug,
          }),
        ),
      ),
    ),
  )

interface DraftAnnotateOutput {
  readonly traceId: string
  readonly feedback: string
  readonly traceCreatedAt: string
  readonly sessionId: string | null
  readonly simulationId: string | null
  readonly scoreId: string
}

const billingLayers = Layer.mergeAll(
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

export const draftAnnotate = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly flaggerSlug: string
}): Promise<DraftAnnotateOutput> => {
  const idempotencyKey = buildBillingIdempotencyKey("flagger-scan", [
    input.organizationId,
    input.flaggerSlug,
    input.traceId,
  ])
  const queuePublisher = await getQueuePublisher()

  const billingResult = await Effect.runPromise(
    meterBillableAction({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      action: "flagger-scan",
      idempotencyKey,
      skipIfBlocked: true,
    }).pipe(
      withPostgres(billingLayers, getPostgresClient(), OrganizationId(input.organizationId)),
      Effect.provideService(QueuePublisher, queuePublisher),
      withTracing,
    ),
  ).catch((error) => {
    logger.error("Flagger billing check failed — treating as billing blocked", {
      organizationId: input.organizationId,
      traceId: input.traceId,
      flaggerSlug: input.flaggerSlug,
      error,
    })
    return { allowed: false as const }
  })

  if (!billingResult.allowed) {
    logger.info("Flagger annotation blocked — billing limit reached", {
      organizationId: input.organizationId,
      traceId: input.traceId,
      flaggerSlug: input.flaggerSlug,
    })
    throw new Error("Billing limit reached for the current billing period")
  }

  return Effect.runPromise(
    draftFlaggerAnnotationUseCase(input).pipe(
      withClickHouse(
        Layer.mergeAll(TraceRepositoryLive, SpanRepositoryLive, ScoreAnalyticsRepositoryLive),
        getClickhouseClient(),
        OrganizationId(input.organizationId),
      ),
      withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), getRedisClient()),
      withTracing,
      Effect.tapError((error) =>
        Effect.sync(() => {
          logger.error("Flagger draft annotate activity failed", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            traceId: input.traceId,
            flaggerSlug: input.flaggerSlug,
            error,
          })
        }),
      ),
    ),
  )
}

export const saveAnnotation = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly flaggerId: string
  readonly flaggerSlug: string
  readonly feedback: string
  readonly traceCreatedAt: string
  readonly sessionId?: string | null
  readonly simulationId?: string | null
  readonly scoreId: string
}): Promise<FlaggerAnnotateOutput> =>
  Effect.runPromise(
    saveFlaggerAnnotationUseCase(input).pipe(
      withPostgres(
        Layer.mergeAll(ScoreRepositoryLive, OutboxEventWriterLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      withClickHouse(
        Layer.mergeAll(TraceRepositoryLive, SpanRepositoryLive, ScoreAnalyticsRepositoryLive),
        getClickhouseClient(),
        OrganizationId(input.organizationId),
      ),
      withAi(AIEmbedLive, getRedisClient()),
      withTracing,
      Effect.tapError((error) =>
        Effect.sync(() => {
          logger.error("Flagger save annotation activity failed", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            traceId: input.traceId,
            flaggerId: input.flaggerId,
            flaggerSlug: input.flaggerSlug,
            error,
          })
        }),
      ),
    ),
  )
