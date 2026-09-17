import { NoCreditsRemainingError } from "@domain/billing"
import { hasFeatureFlagUseCase } from "@domain/feature-flags"
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
  type FlaggerScreeningSelection,
  recordFlaggerScreeningOutcomeUseCase,
  type ScreenSessionFlaggersResult,
  type SessionHint,
  saveFlaggerAnnotationUseCase,
  screenSessionFlaggersUseCase,
  upsertFlaggerVerdictScore,
  upsertSafetyFindingScore,
} from "@domain/flaggers"
import type { SafetyFindingKind } from "@domain/scores"
import { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { AIEmbedLive, AIGenerateLive, withAi } from "@platform/ai"
import {
  JevPreclassifierDecisionProviderLive,
  JevShadowDecisionProviderLive,
  JevShadowDecisionProviderUnconfigured,
} from "@platform/ai-jev"
import { checkRedisRateLimit, RedisBillingSpendReservationLive, RedisCacheStoreLive } from "@platform/cache-redis"
import {
  FlaggerScreeningDecisionRepositoryLive,
  JevPreclassifierObservationRepositoryLive,
  JevShadowObservationRepositoryLive,
  ScoreAnalyticsRepositoryLive,
  SessionAnalysisRepositoryLive,
  SessionMomentLabelRepositoryLive,
  SessionRepositoryLive,
  SpanRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  FeatureFlagRepositoryLive,
  FlaggerRepositoryLive,
  OutboxEventWriterLive,
  ScoreRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnvOptional } from "@platform/env"
import { createLogger, withTracing } from "@repo/observability"
import { Context as ActivityContext } from "@temporalio/activity"
import { Cause, Effect, Layer } from "effect"
import { getClickhouseClient, getJevShadowPostgresClient, getPostgresClient, getRedisClient } from "../clients.ts"
import { billingMeteringRepositoriesLive, withActivityAIMetering } from "./ai-metering.ts"

const logger = createLogger("workflows-flagger-session")
const JEV_FEATURE_FLAG_TIMEOUT_MS = 1_000

const currentActivityAttempt = () => {
  try {
    return ActivityContext.current().info.attempt
  } catch {
    return 1
  }
}

const getJevActivityIdentity = () => {
  try {
    const info = ActivityContext.current().info
    return {
      workflowId: info.workflowExecution?.workflowId ?? "unknown-workflow",
      workflowRunId: info.workflowExecution?.runId ?? "unknown-run",
      activityId: info.activityId,
      activityAttempt: info.attempt,
    }
  } catch {
    return {
      workflowId: "unknown-workflow",
      workflowRunId: "unknown-run",
      activityId: "unknown-activity",
      activityAttempt: 1,
    }
  }
}

type HasJevFeatureFlag = (organizationId: string) => Effect.Effect<boolean, unknown>

const hasJevShadowFeatureFlag: HasJevFeatureFlag = (organizationId) =>
  hasFeatureFlagUseCase({ identifier: "jevFlaggerShadow" }).pipe(
    withPostgres(FeatureFlagRepositoryLive, getJevShadowPostgresClient(), OrganizationId(organizationId)),
  )

export const isJevShadowEnabledForOrganization = (
  organizationId: string,
  hasFeatureFlag: HasJevFeatureFlag = hasJevShadowFeatureFlag,
) =>
  Effect.gen(function* () {
    const globalEnabled = yield* parseEnvOptional("LAT_JEV_FLAGGER_SHADOW_ENABLED", "boolean")
    const apiKey = yield* parseEnvOptional("LAT_JEV_API_KEY", "string")
    if (globalEnabled !== true || !apiKey) return false

    return yield* hasFeatureFlag(organizationId).pipe(Effect.timeout(JEV_FEATURE_FLAG_TIMEOUT_MS))
  }).pipe(
    Effect.catchCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.succeed(false))),
  )

const hasJevPreclassifierFeatureFlag: HasJevFeatureFlag = (organizationId) =>
  hasFeatureFlagUseCase({ identifier: "jevFlaggerPreclassifier" }).pipe(
    withPostgres(FeatureFlagRepositoryLive, getJevShadowPostgresClient(), OrganizationId(organizationId)),
  )

export const isJevFlaggerPreclassifierEnabledForOrganization = (
  organizationId: string,
  hasFeatureFlag: HasJevFeatureFlag = hasJevPreclassifierFeatureFlag,
) =>
  Effect.gen(function* () {
    const globalEnabled = yield* parseEnvOptional("LAT_JEV_FLAGGER_PRECLASSIFIER_ENABLED", "boolean")
    const apiKey = yield* parseEnvOptional("LAT_JEV_API_KEY", "string")
    if (globalEnabled !== true || !apiKey) return false
    return yield* hasFeatureFlag(organizationId).pipe(Effect.timeout(JEV_FEATURE_FLAG_TIMEOUT_MS))
  }).pipe(
    Effect.catchCause((cause) => (Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.succeed(false))),
  )

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
): Promise<ScreenSessionFlaggersResult> => {
  const jevPreclassifierEnabled = await Effect.runPromise(
    isJevFlaggerPreclassifierEnabledForOrganization(input.organizationId),
  )
  const activityIdentity = getJevActivityIdentity()

  return Effect.runPromise(
    screenSessionFlaggersUseCase(
      { ...input, attempt: currentActivityAttempt() },
      {
        checkRateLimit,
        ...(jevPreclassifierEnabled ? { jevPreclassifier: { enabled: true, ...activityIdentity } } : {}),
      },
    ).pipe(
      withPostgres(
        Layer.mergeAll(FlaggerRepositoryLive, OutboxEventWriterLive, ScoreRepositoryLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      withClickHouse(
        Layer.mergeAll(
          ScoreAnalyticsRepositoryLive,
          FlaggerScreeningDecisionRepositoryLive,
          JevPreclassifierObservationRepositoryLive,
          SessionRepositoryLive,
          SpanRepositoryLive,
          SessionAnalysisRepositoryLive,
          SessionMomentLabelRepositoryLive,
        ),
        getClickhouseClient(),
        OrganizationId(input.organizationId),
      ),
      Effect.provide(
        jevPreclassifierEnabled ? JevPreclassifierDecisionProviderLive : JevShadowDecisionProviderUnconfigured,
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
}

export interface ClassifySessionFlaggerActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly flaggerSlug: string
  readonly hints: readonly SessionHint[]
  readonly analysisHash?: string | undefined
  readonly screeningSelection?: FlaggerScreeningSelection | undefined
}

export const classifySessionFlagger = async (
  input: ClassifySessionFlaggerActivityInput,
): Promise<ClassifySessionFlaggerResult> => {
  const jevShadowEnabled = await Effect.runPromise(isJevShadowEnabledForOrganization(input.organizationId))
  const activityIdentity = getJevActivityIdentity()

  return Effect.runPromise(
    classifySessionFlaggerUseCase({
      ...input,
      ...(jevShadowEnabled
        ? { jevShadow: { enabled: true, ...activityIdentity, screeningSelection: input.screeningSelection } }
        : {}),
    }).pipe(
      withActivityAIMetering({
        organizationId: input.organizationId,
        projectId: input.projectId,
        label: "flagger-classify",
      }),
      Effect.tap((result) =>
        input.screeningSelection
          ? recordFlaggerScreeningOutcomeUseCase({
              selection: input.screeningSelection,
              attempt: currentActivityAttempt(),
              outcome: result.outcome,
            })
          : Effect.void,
      ),
      Effect.tapError(() =>
        input.screeningSelection
          ? recordFlaggerScreeningOutcomeUseCase({
              selection: input.screeningSelection,
              attempt: currentActivityAttempt(),
              outcome: "error",
            })
          : Effect.void,
      ),
      withPostgres(
        Layer.mergeAll(FlaggerRepositoryLive, billingMeteringRepositoriesLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      Effect.provide(RedisBillingSpendReservationLive(getRedisClient())),
      withClickHouse(
        Layer.mergeAll(
          SessionRepositoryLive,
          SpanRepositoryLive,
          FlaggerScreeningDecisionRepositoryLive,
          JevShadowObservationRepositoryLive,
        ),
        getClickhouseClient(),
        OrganizationId(input.organizationId),
      ),
      withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), getRedisClient()),
      Effect.provide(jevShadowEnabled ? JevShadowDecisionProviderLive : JevShadowDecisionProviderUnconfigured),
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
}

export interface SaveSessionFlaggerVerdictActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly flaggerSlug: string
  readonly verdict: "success" | "failure"
  readonly feedback: string
  readonly latestTraceId: string
  readonly simulationId: string | null
  readonly contentHash: string
  readonly analysisHash: string
  readonly scoringArtifactVersion: string
  readonly messageIndex?: number | undefined
  readonly flaggerTraceId?: string | undefined
}

/**
 * Persists a verdict flagger's judgement in one step.
 *
 * Unlike the negative-annotation path there is nothing to draft: a verdict
 * always arrives with its own feedback, so the annotator fallback would only
 * spend credits, and the anchor dedup that path performs is the wrong rule for
 * a whole-session verdict that is re-judged each generation.
 */
export const saveSessionFlaggerVerdict = async (input: SaveSessionFlaggerVerdictActivityInput): Promise<void> =>
  Effect.runPromise(
    upsertFlaggerVerdictScore({
      projectId: ProjectId(input.projectId),
      traceId: TraceId(input.latestTraceId),
      sessionId: input.sessionId,
      simulationId: input.simulationId,
      flaggerSlug: input.flaggerSlug,
      verdict: input.verdict,
      feedback: input.feedback,
      contentHash: input.contentHash,
      analysisHash: input.analysisHash,
      scoringArtifactVersion: input.scoringArtifactVersion,
      flaggerPath: "sampled",
      ...(input.messageIndex !== undefined ? { messageIndex: input.messageIndex } : {}),
      ...(input.flaggerTraceId !== undefined ? { flaggerTraceId: input.flaggerTraceId } : {}),
    }).pipe(
      withPostgres(
        Layer.mergeAll(ScoreRepositoryLive, OutboxEventWriterLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      withClickHouse(ScoreAnalyticsRepositoryLive, getClickhouseClient(), OrganizationId(input.organizationId)),
      withTracing,
      Effect.tap((result) =>
        Effect.sync(() =>
          logger.info("Session flagger verdict saved", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionId: input.sessionId,
            flaggerSlug: input.flaggerSlug,
            verdict: input.verdict,
            status: result.status,
            scoreId: result.scoreId,
          }),
        ),
      ),
      Effect.tapError((error) =>
        Effect.sync(() =>
          logger.error("Session flagger verdict save failed", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionId: input.sessionId,
            flaggerSlug: input.flaggerSlug,
            error,
          }),
        ),
      ),
      Effect.asVoid,
    ),
  )

export interface SaveSessionFlaggerSafetyFindingActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly flaggerSlug: string
  readonly safetyFindingKind: SafetyFindingKind
  readonly feedback: string
  readonly latestTraceId: string
  readonly simulationId: string | null
  readonly contentHash: string
  readonly scoringArtifactVersion: string
  readonly analysisHash?: string | undefined
  readonly messageIndex?: number | undefined
  readonly flaggerTraceId?: string | undefined
}

/**
 * Persists a Safety detector's structured finding in one step.
 *
 * The finding kind decides the polarity, so exposure and confirmed harm take
 * the same path as a defense; only the written score differs.
 */
export const saveSessionFlaggerSafetyFinding = async (
  input: SaveSessionFlaggerSafetyFindingActivityInput,
): Promise<void> =>
  Effect.runPromise(
    upsertSafetyFindingScore({
      projectId: ProjectId(input.projectId),
      traceId: TraceId(input.latestTraceId),
      sessionId: input.sessionId,
      simulationId: input.simulationId,
      flaggerSlug: input.flaggerSlug,
      safetyFindingKind: input.safetyFindingKind,
      feedback: input.feedback,
      contentHash: input.contentHash,
      scoringArtifactVersion: input.scoringArtifactVersion,
      flaggerPath: "sampled",
      ...(input.analysisHash !== undefined ? { analysisHash: input.analysisHash } : {}),
      ...(input.messageIndex !== undefined ? { messageIndex: input.messageIndex } : {}),
      ...(input.flaggerTraceId !== undefined ? { flaggerTraceId: input.flaggerTraceId } : {}),
    }).pipe(
      withPostgres(
        Layer.mergeAll(ScoreRepositoryLive, OutboxEventWriterLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      withClickHouse(ScoreAnalyticsRepositoryLive, getClickhouseClient(), OrganizationId(input.organizationId)),
      withTracing,
      Effect.tap((result) =>
        Effect.sync(() =>
          logger.info("Session flagger safety finding saved", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionId: input.sessionId,
            flaggerSlug: input.flaggerSlug,
            safetyFindingKind: input.safetyFindingKind,
            status: result.status,
            scoreId: result.scoreId,
          }),
        ),
      ),
      Effect.tapError((error) =>
        Effect.sync(() =>
          logger.error("Session flagger safety finding save failed", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionId: input.sessionId,
            flaggerSlug: input.flaggerSlug,
            error,
          }),
        ),
      ),
      Effect.asVoid,
    ),
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
        Layer.mergeAll(billingMeteringRepositoriesLive, ScoreRepositoryLive),
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
  readonly flaggerTraceId?: string | undefined
  readonly scoringArtifactVersion: string
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
      flaggerTraceId: input.flaggerTraceId,
      scoringArtifactVersion: input.scoringArtifactVersion,
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
