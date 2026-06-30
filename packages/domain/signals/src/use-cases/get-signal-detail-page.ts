import {
  deriveSignalAlignmentState,
  type Evaluation,
  EvaluationRepository,
  isActiveEvaluation,
  type SignalAlignmentState,
} from "@domain/evaluations"
import type { WorkflowQuerier } from "@domain/queue"
import {
  ScoreAnalyticsRepository,
  ScoreRepository,
  type SignalDimension,
  type SignalEscalationThresholdBucket,
  type SignalOccurrenceBucket,
} from "@domain/scores"
import {
  type ChSqlClient,
  NotFoundError,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  resolveSettings,
  SettingsReader,
  type SignalId,
  type SqlClient,
} from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { DEFAULT_ESCALATION_SENSITIVITY_K } from "../constants.ts"
import { type DimensionPattern, rankDimensionValues } from "../dimension-patterns.ts"
import type { SignalState } from "../entities/signal.ts"
import { deriveSignalLifecycleStates, getEscalationOccurrenceThreshold } from "../helpers.ts"
import { buildHistogramBucketScaffold, fillBuckets } from "../histogram-buckets.ts"
import { SignalRepository, type SignalWithLifecycle } from "../ports/signal-repository.ts"
import { getRelatedSignalsUseCase, type RelatedSignal } from "./get-related-signals.ts"
import { TAG_AGGREGATION_FALLBACK_DAYS } from "./list-signals.ts"

const SIGNAL_DETAIL_TREND_BUCKET_SECONDS = 12 * 60 * 60
const SIGNAL_EXAMPLES_LIMIT = 30
const SIGNAL_DIMENSIONS = [
  "model",
  "provider",
  "tool",
  "tag",
  "finishReason",
] as const satisfies readonly SignalDimension[]

export const signalDetailSectionSchema = z.enum(["core", "impact", "patterns", "related", "occurrences", "sessions"])
export type SignalDetailSection = z.infer<typeof signalDetailSectionSchema>

const getSignalDetailPageInputSchema = z.object({
  organizationId: z.custom<OrganizationId>(),
  projectId: z.custom<ProjectId>(),
  signalId: z.custom<SignalId>(),
  sections: z.array(signalDetailSectionSchema).min(1).default(["core"]),
  sessionsLimit: z.number().int().min(1).max(100).default(25),
  sessionsOffset: z.number().int().min(0).default(0),
  now: z.date().optional(),
})

export type GetSignalDetailPageInput = z.input<typeof getSignalDetailPageInputSchema>

export interface SignalDetailCore {
  readonly issue: SignalWithLifecycle
  readonly states: readonly SignalState[]
  readonly firstSeenAt: Date | null
  readonly lastSeenAt: Date | null
  readonly totalOccurrences: number
  readonly escalationOccurrenceThreshold: number | null
  readonly trend: readonly SignalOccurrenceBucket[]
  readonly trendBucketSeconds: number
  readonly trendEscalationThresholds: readonly SignalEscalationThresholdBucket[]
  readonly evaluations: readonly Evaluation[]
  readonly tags: readonly string[]
  readonly flaggerSlugs: readonly string[]
  readonly keepMonitoringDefault: boolean
  readonly alignmentState: SignalAlignmentState
}

export interface SignalDetailImpact {
  readonly occurrences: number
  readonly affectedTraces: number
  readonly affectedSessions: number
  readonly affectedUsers: number
  readonly costMicrocents: number
  readonly tokens: number
  readonly totalProjectTraces: number
  readonly affectedTracesPercent: number
}

export interface SignalDetailPattern {
  readonly dimension: SignalDimension
  readonly baseRate: number
  readonly signalAffectedTraces: number
  readonly patterns: readonly DimensionPattern[]
}

export interface SignalDetailOccurrence {
  readonly scoreId: string
  readonly traceId: string
  readonly feedback: string
  readonly createdAt: Date
  readonly annotatorId: string | null
  readonly flaggerSlug: string | null
  readonly anchor: {
    readonly messageIndex: number
    readonly partIndex: number | null
    readonly startOffset: number | null
    readonly endOffset: number | null
    readonly textFormat: string | null
  }
}

export interface SignalDetailSessions {
  readonly totalCount: number
  readonly items: readonly { readonly sessionId: string }[]
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

export interface GetSignalDetailPageResult {
  readonly core: SignalDetailCore | null
  readonly impact: SignalDetailImpact | null
  readonly patterns: readonly SignalDetailPattern[] | null
  readonly related: readonly RelatedSignal[] | null
  readonly occurrences: readonly SignalDetailOccurrence[] | null
  readonly sessions: SignalDetailSessions | null
}

export type GetSignalDetailPageError = NotFoundError | RepositoryError

const toUtcDayEnd = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999))

export const getSignalDetailPageUseCase = (
  input: GetSignalDetailPageInput,
): Effect.Effect<
  GetSignalDetailPageResult,
  GetSignalDetailPageError,
  | ChSqlClient
  | EvaluationRepository
  | ScoreAnalyticsRepository
  | ScoreRepository
  | SettingsReader
  | SignalRepository
  | SqlClient
  | TraceRepository
  | WorkflowQuerier
> =>
  Effect.gen(function* () {
    const parsed = getSignalDetailPageInputSchema.parse(input)
    const sections = new Set(parsed.sections)
    const now = parsed.now ?? new Date()
    const signalRepository = yield* SignalRepository
    const issue = yield* signalRepository.findById(parsed.signalId)

    if (issue.projectId !== parsed.projectId) {
      return yield* new NotFoundError({ entity: "Signal", id: String(parsed.signalId) })
    }

    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const evaluationRepository = yield* EvaluationRepository
    const scoreRepository = yield* ScoreRepository
    const settingsReader = yield* SettingsReader
    const traceRepository = yield* TraceRepository

    const loadCore = sections.has("core")
      ? Effect.gen(function* () {
          const trendTo = toUtcDayEnd(now)
          const trendFrom = new Date(trendTo)
          trendFrom.setUTCDate(trendFrom.getUTCDate() - 13)
          trendFrom.setUTCHours(0, 0, 0, 0)
          const trendScaffold = buildHistogramBucketScaffold({
            from: trendFrom,
            to: trendTo,
            bucketSeconds: SIGNAL_DETAIL_TREND_BUCKET_SECONDS,
          })
          const tagsFrom = new Date(now)
          tagsFrom.setUTCDate(tagsFrom.getUTCDate() - TAG_AGGREGATION_FALLBACK_DAYS)
          const projectSettings = yield* settingsReader.getProjectSettings(parsed.projectId)
          const kShort = projectSettings?.escalation?.sensitivity ?? DEFAULT_ESCALATION_SENSITIVITY_K

          const flaggerSlugsEffect =
            issue.source === "flagger"
              ? scoreRepository.listFlaggerSlugsBySignalId({ projectId: parsed.projectId, signalId: issue.id })
              : Effect.succeed<readonly string[]>([])

          const [occurrences, trend, thresholdSeries, evaluationPage, tagsAggregates, flaggerSlugs, settings] =
            yield* Effect.all([
              scoreAnalyticsRepository.aggregateBySignals({
                organizationId: parsed.organizationId,
                projectId: parsed.projectId,
                signalIds: [issue.id],
              }),
              scoreAnalyticsRepository.trendBySignal({
                organizationId: parsed.organizationId,
                projectId: parsed.projectId,
                signalId: issue.id,
                days: 14,
                bucketSeconds: SIGNAL_DETAIL_TREND_BUCKET_SECONDS,
              }),
              scoreAnalyticsRepository.escalationThresholdHistogramBySignals({
                organizationId: parsed.organizationId,
                projectId: parsed.projectId,
                signalIds: [issue.id],
                timeRange: { from: trendFrom, to: trendTo },
                bucketSeconds: SIGNAL_DETAIL_TREND_BUCKET_SECONDS,
                kShort,
              }),
              evaluationRepository.listBySignalId({
                projectId: parsed.projectId,
                signalId: issue.id,
                options: { lifecycle: "active", limit: 1000 },
              }),
              scoreAnalyticsRepository.aggregateTagsBySignals({
                organizationId: parsed.organizationId,
                projectId: parsed.projectId,
                signalIds: [issue.id],
                timeRange: { from: tagsFrom, to: now },
              }),
              flaggerSlugsEffect,
              resolveSettings({ projectId: parsed.projectId }),
            ])

          const occurrence = occurrences[0] ?? null
          const activeEvaluations = evaluationPage.items.filter(isActiveEvaluation)
          const alignmentState = yield* deriveSignalAlignmentState({
            signalId: issue.id,
            activeEvaluations,
            isAutomaticallyMonitored: issue.source === "flagger",
          })

          return {
            issue,
            states: deriveSignalLifecycleStates({
              issue,
              isEscalating: issue.lifecycle.isEscalating,
              now,
            }),
            firstSeenAt: occurrence?.firstSeenAt ?? null,
            lastSeenAt: occurrence?.lastSeenAt ?? null,
            totalOccurrences: occurrence?.totalOccurrences ?? 0,
            escalationOccurrenceThreshold:
              occurrence !== null ? getEscalationOccurrenceThreshold(occurrence.baselineAvgOccurrences) : null,
            trend: fillBuckets({ scaffold: trendScaffold, buckets: trend }),
            trendBucketSeconds: SIGNAL_DETAIL_TREND_BUCKET_SECONDS,
            trendEscalationThresholds: thresholdSeries[0]?.buckets ?? [],
            evaluations: activeEvaluations,
            tags: tagsAggregates[0]?.tags ?? [],
            flaggerSlugs,
            keepMonitoringDefault: settings.keepMonitoring,
            alignmentState,
          } satisfies SignalDetailCore
        })
      : Effect.succeed(null)

    const loadImpact = sections.has("impact")
      ? Effect.gen(function* () {
          const [impact, totalProjectTraces] = yield* Effect.all([
            scoreAnalyticsRepository.aggregateImpactBySignal({
              organizationId: parsed.organizationId,
              projectId: parsed.projectId,
              signalId: issue.id,
            }),
            traceRepository.countByProjectId({
              organizationId: parsed.organizationId,
              projectId: parsed.projectId,
            }),
          ])
          return {
            occurrences: impact.occurrences,
            affectedTraces: impact.affectedTraces,
            affectedSessions: impact.affectedSessions,
            affectedUsers: impact.affectedUsers,
            costMicrocents: impact.costMicrocents,
            tokens: impact.tokens,
            totalProjectTraces,
            affectedTracesPercent:
              totalProjectTraces === 0 ? 0 : Math.min(impact.affectedTraces / totalProjectTraces, 1),
          } satisfies SignalDetailImpact
        })
      : Effect.succeed(null)

    const loadPatterns = sections.has("patterns")
      ? Effect.gen(function* () {
          const comparisons = yield* Effect.all(
            SIGNAL_DIMENSIONS.map((dimension) =>
              scoreAnalyticsRepository.aggregateDimensionBySignal({
                organizationId: parsed.organizationId,
                projectId: parsed.projectId,
                signalId: issue.id,
                dimension,
              }),
            ),
          )
          return comparisons.map(
            (comparison): SignalDetailPattern => ({
              dimension: comparison.dimension,
              baseRate: comparison.baseRate,
              signalAffectedTraces: comparison.signalAffectedTraces,
              patterns: rankDimensionValues(comparison),
            }),
          )
        })
      : Effect.succeed(null)

    const loadRelated = sections.has("related")
      ? getRelatedSignalsUseCase({
          organizationId: parsed.organizationId,
          projectId: parsed.projectId,
          signalId: issue.id,
          now,
        })
      : Effect.succeed(null)

    const loadOccurrences = sections.has("occurrences")
      ? Effect.gen(function* () {
          const page = yield* scoreRepository.listBySignalId({
            projectId: parsed.projectId,
            signalId: issue.id,
            source: "annotation",
            options: { limit: SIGNAL_EXAMPLES_LIMIT, draftMode: "exclude" },
          })
          return page.items.flatMap((score): SignalDetailOccurrence[] => {
            if (
              score.sourceType !== "annotation" ||
              score.traceId === null ||
              score.metadata.messageIndex === undefined
            ) {
              return []
            }
            const { messageIndex, partIndex, startOffset, endOffset, textFormat, flaggerSlug } = score.metadata
            return [
              {
                scoreId: score.id,
                traceId: score.traceId,
                feedback: score.feedback,
                createdAt: score.createdAt,
                annotatorId: score.annotatorId,
                flaggerSlug: flaggerSlug ?? null,
                anchor: {
                  messageIndex,
                  partIndex: partIndex ?? null,
                  startOffset: startOffset ?? null,
                  endOffset: endOffset ?? null,
                  textFormat: textFormat ?? null,
                },
              },
            ]
          })
        })
      : Effect.succeed(null)

    const loadSessions = sections.has("sessions")
      ? Effect.gen(function* () {
          const [sessionPage, totalCount] = yield* Effect.all([
            scoreAnalyticsRepository.listSessionsBySignal({
              organizationId: parsed.organizationId,
              projectId: parsed.projectId,
              signalId: issue.id,
              limit: parsed.sessionsLimit,
              offset: parsed.sessionsOffset,
            }),
            scoreAnalyticsRepository.countSessionsBySignal({
              organizationId: parsed.organizationId,
              projectId: parsed.projectId,
              signalId: issue.id,
            }),
          ])
          return {
            totalCount,
            items: sessionPage.items.map((item) => ({ sessionId: item.sessionId })),
            hasMore: sessionPage.hasMore,
            limit: sessionPage.limit,
            offset: sessionPage.offset,
          } satisfies SignalDetailSessions
        })
      : Effect.succeed(null)

    const [core, impact, patterns, related, occurrences, sessions] = yield* Effect.all([
      loadCore,
      loadImpact,
      loadPatterns,
      loadRelated,
      loadOccurrences,
      loadSessions,
    ])

    return { core, impact, patterns, related, occurrences, sessions } satisfies GetSignalDetailPageResult
  }).pipe(Effect.withSpan("signals.getDetailPage"))
