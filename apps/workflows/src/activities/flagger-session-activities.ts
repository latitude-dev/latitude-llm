import { NoCreditsRemainingError } from "@domain/billing"
import {
  type CheckFlaggerLlmRateLimit,
  type ClassifySessionFlaggerResult,
  classifySessionFlaggerUseCase,
  type DraftSessionFlaggerAnnotationResult,
  draftSessionFlaggerAnnotationWithBillingUseCase,
  FLAGGER_HINTED_RATE_LIMIT,
  FLAGGER_SAMPLED_POSITIVE_RATE_LIMIT,
  FLAGGER_SAMPLED_RATE_LIMIT,
  type FlaggerAnnotateOutput,
  type FlaggerClassificationReason,
  type ScreenSessionFlaggersResult,
  type SessionHint,
  saveFlaggerAnnotationUseCase,
  screenSessionFlaggersUseCase,
} from "@domain/flaggers"
import { OrganizationId } from "@domain/shared"
import { AIEmbedLive, AIGenerateLive, withAi } from "@platform/ai"
import { checkRedisRateLimit, RedisBillingSpendReservationLive, RedisCacheStoreLive } from "@platform/cache-redis"
import {
  ScoreAnalyticsRepositoryLive,
  SessionAnalysisRepositoryLive,
  SessionMomentLabelRepositoryLive,
  SessionRepositoryLive,
  SpanRepositoryLive,
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
import { withActivityAIMetering } from "./ai-metering.ts"

const logger = createLogger("workflows-flagger-session")

const rateLimitBucket = (reason: FlaggerClassificationReason, hasPositiveHints: boolean) => {
  if (reason === "hinted") return { bucket: "hinted", limit: FLAGGER_HINTED_RATE_LIMIT }
  if (hasPositiveHints) return { bucket: "sampled-positive", limit: FLAGGER_SAMPLED_POSITIVE_RATE_LIMIT }
  return { bucket: "sampled", limit: FLAGGER_SAMPLED_RATE_LIMIT }
}

const checkRateLimit: CheckFlaggerLlmRateLimit = ({ organizationId, flaggerSlug, reason, hasPositiveHints }) => {
  const { bucket, limit } = rateLimitBucket(reason, hasPositiveHints)
  return checkRedisRateLimit(getRedisClient(), {
    key: `org:${organizationId}:ratelimit:flagger-llm:${bucket}:${flaggerSlug}`,
    maxRequests: limit.maxRequests,
    windowSeconds: limit.windowSeconds,
  }).pipe(Effect.map((result) => result.allowed))
}

const summarizeDecisions = (decisions: ScreenSessionFlaggersResult["decisions"]) => {
  const counts: Record<string, number> = { matched: 0, classify: 0, dropped: 0, suppressed: 0, failed: 0 }
  for (const decision of decisions) {
    const key = decision.action === "matched-issue" ? "matched" : decision.action
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

export interface ScreenSessionFlaggersActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly analysisHash: string
}

export const screenSessionFlaggers = async (
  input: ScreenSessionFlaggersActivityInput,
): Promise<ScreenSessionFlaggersResult> =>
  Effect.runPromise(
    screenSessionFlaggersUseCase(input, { checkRateLimit }).pipe(
      withPostgres(
        Layer.mergeAll(FlaggerRepositoryLive, OutboxEventWriterLive, ScoreRepositoryLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      withClickHouse(
        Layer.mergeAll(
          ScoreAnalyticsRepositoryLive,
          SessionRepositoryLive,
          SpanRepositoryLive,
          SessionAnalysisRepositoryLive,
          SessionMomentLabelRepositoryLive,
        ),
        getClickhouseClient(),
        OrganizationId(input.organizationId),
      ),
      Effect.provide(RedisCacheStoreLive(getRedisClient())),
      withTracing,
      Effect.tap((result) =>
        Effect.sync(() =>
          logger.info("Flagger screening completed", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionId: input.sessionId,
            skipped: result.skipped ?? null,
            hintKinds: [...new Set(result.hints.map((hint) => hint.kind))],
            ...summarizeDecisions(result.decisions),
            classifications: result.classifications.map((c) => `${c.flaggerSlug}:${c.reason}`),
          }),
        ),
      ),
      Effect.tapError((error) =>
        Effect.sync(() =>
          logger.error("Flagger screening failed", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionId: input.sessionId,
            error,
          }),
        ),
      ),
    ),
  )

export interface ClassifySessionFlaggerActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly flaggerSlug: string
  readonly hints: readonly SessionHint[]
}

export const classifySessionFlagger = async (
  input: ClassifySessionFlaggerActivityInput,
): Promise<ClassifySessionFlaggerResult> =>
  Effect.runPromise(
    classifySessionFlaggerUseCase(input).pipe(
      withActivityAIMetering({
        organizationId: input.organizationId,
        projectId: input.projectId,
        label: "flagger-classify",
      }),
      withPostgres(
        Layer.mergeAll(FlaggerRepositoryLive, billingLayers),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      Effect.provide(RedisBillingSpendReservationLive(getRedisClient())),
      withClickHouse(
        Layer.mergeAll(SessionRepositoryLive, SpanRepositoryLive),
        getClickhouseClient(),
        OrganizationId(input.organizationId),
      ),
      withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), getRedisClient()),
      Effect.provide(RedisCacheStoreLive(getRedisClient())),
      withTracing,
      Effect.tap((result) =>
        Effect.sync(() =>
          logger.info("Classified session flagger", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionId: input.sessionId,
            flaggerSlug: input.flaggerSlug,
            matched: result.matched,
          }),
        ),
      ),
    ),
  )

const billingLayers = Layer.mergeAll(
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OutboxEventWriterLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

export interface DraftSessionFlaggerAnnotationActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly flaggerSlug: string
  readonly contentHash: string
  readonly latestTraceId: string
  readonly feedback?: string | undefined
  readonly messageIndex?: number | undefined
}

export const draftSessionFlaggerAnnotation = async (
  input: DraftSessionFlaggerAnnotationActivityInput,
): Promise<DraftSessionFlaggerAnnotationResult> =>
  Effect.runPromise(
    draftSessionFlaggerAnnotationWithBillingUseCase(input).pipe(
      withPostgres(
        Layer.mergeAll(billingLayers, ScoreRepositoryLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      Effect.provide(RedisBillingSpendReservationLive(getRedisClient())),
      withClickHouse(
        Layer.mergeAll(SessionRepositoryLive, SpanRepositoryLive, ScoreAnalyticsRepositoryLive),
        getClickhouseClient(),
        OrganizationId(input.organizationId),
      ),
      withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), getRedisClient()),
      withTracing,
      Effect.tapError((error) =>
        Effect.sync(() => {
          if (error instanceof NoCreditsRemainingError) {
            logger.info("Session flagger annotation blocked — billing limit reached", {
              organizationId: input.organizationId,
              sessionId: input.sessionId,
              flaggerSlug: input.flaggerSlug,
            })
            return
          }
          logger.error("Session flagger draft annotation failed", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionId: input.sessionId,
            flaggerSlug: input.flaggerSlug,
            error,
          })
        }),
      ),
    ),
  )

export interface SaveSessionFlaggerAnnotationActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly flaggerId: string
  readonly flaggerSlug: string
  readonly latestTraceId: string
  readonly simulationId: string | null
  readonly scoreId: string
  readonly feedback: string
  readonly traceCreatedAt: string
  readonly contentHash: string
  readonly messageIndex?: number | undefined
}

export const saveSessionFlaggerAnnotation = async (
  input: SaveSessionFlaggerAnnotationActivityInput,
): Promise<FlaggerAnnotateOutput> =>
  Effect.runPromise(
    saveFlaggerAnnotationUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      flaggerId: input.flaggerId,
      flaggerSlug: input.flaggerSlug,
      traceId: input.latestTraceId,
      sessionId: input.sessionId,
      simulationId: input.simulationId,
      scoreId: input.scoreId,
      feedback: input.feedback,
      traceCreatedAt: input.traceCreatedAt,
      messageIndex: input.messageIndex,
      contentHash: input.contentHash,
    }).pipe(
      withPostgres(
        Layer.mergeAll(ScoreRepositoryLive, OutboxEventWriterLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      withClickHouse(
        Layer.mergeAll(SessionRepositoryLive, SpanRepositoryLive, ScoreAnalyticsRepositoryLive),
        getClickhouseClient(),
        OrganizationId(input.organizationId),
      ),
      withAi(AIEmbedLive, getRedisClient()),
      withTracing,
      Effect.tapError((error) =>
        Effect.sync(() =>
          logger.error("Session flagger save annotation failed", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionId: input.sessionId,
            flaggerId: input.flaggerId,
            flaggerSlug: input.flaggerSlug,
            error,
          }),
        ),
      ),
    ),
  )
