import {
  authorizeBillableAction,
  buildBillingIdempotencyKey,
  makeAIMeteringScope,
  NoCreditsRemainingError,
  provideAIMeteringScope,
} from "@domain/billing"
import {
  draftFlaggerAnnotationWithBillingUseCase,
  type FlaggerAnnotateOutput,
  type RunFlaggerResult,
  runFlaggerUseCase,
  saveFlaggerAnnotationUseCase,
} from "@domain/flaggers"
import { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { AIEmbedLive, AIGenerateLive, withAi } from "@platform/ai"
import { RedisBillingSpendReservationLive, RedisCacheStoreLive } from "@platform/cache-redis"
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
  FlaggerRepositoryLive,
  OutboxEventWriterLive,
  ScoreRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("workflows-flagger")

export const runFlagger = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly flaggerSlug: string
}): Promise<RunFlaggerResult> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const organizationId = OrganizationId(input.organizationId)
      const authorization = yield* authorizeBillableAction({
        organizationId,
        action: "llm-call",
        skipIfBlocked: true,
        idempotencyKey: buildBillingIdempotencyKey("llm-call", [
          input.organizationId,
          "flagger-run",
          input.flaggerSlug,
          input.traceId,
          "authorize",
        ]),
      })

      if (!authorization.allowed) {
        logger.info("Flagger run skipped — billing limit reached", {
          organizationId: input.organizationId,
          traceId: input.traceId,
          flaggerSlug: input.flaggerSlug,
        })
        return { matched: false } satisfies RunFlaggerResult
      }

      const meteringScope = yield* makeAIMeteringScope({
        organizationId,
        projectId: ProjectId(input.projectId),
        keyParts: ["flagger-run", input.flaggerSlug, input.traceId],
        context: authorization.context,
        traceId: TraceId(input.traceId),
      })

      return yield* runFlaggerUseCase(input).pipe(provideAIMeteringScope(meteringScope))
    }).pipe(
      withPostgres(
        Layer.mergeAll(FlaggerRepositoryLive, billingLayers),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      withClickHouse(TraceRepositoryLive, getClickhouseClient(), OrganizationId(input.organizationId)),
      withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), getRedisClient()),
      Effect.provide(RedisBillingSpendReservationLive(getRedisClient())),
      Effect.provide(RedisCacheStoreLive(getRedisClient())),
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
  readonly messageIndex?: number | undefined
}

const billingLayers = Layer.mergeAll(
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OutboxEventWriterLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

export const draftAnnotate = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly flaggerSlug: string
  readonly feedback?: string | undefined
  readonly messageIndex?: number | undefined
}): Promise<DraftAnnotateOutput> => {
  return Effect.runPromise(
    draftFlaggerAnnotationWithBillingUseCase(input).pipe(
      withPostgres(billingLayers, getPostgresClient(), OrganizationId(input.organizationId)),
      Effect.provide(RedisBillingSpendReservationLive(getRedisClient())),
      withClickHouse(
        Layer.mergeAll(TraceRepositoryLive, SpanRepositoryLive, ScoreAnalyticsRepositoryLive),
        getClickhouseClient(),
        OrganizationId(input.organizationId),
      ),
      withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), getRedisClient()),
      withTracing,
      Effect.tapError((error) =>
        Effect.sync(() => {
          if (error instanceof NoCreditsRemainingError) {
            logger.info("Flagger annotation blocked — billing limit reached", {
              organizationId: input.organizationId,
              traceId: input.traceId,
              flaggerSlug: input.flaggerSlug,
            })
            return
          }
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
  readonly messageIndex?: number | undefined
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
