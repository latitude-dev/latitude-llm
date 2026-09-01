import {
  buildSignalPreviewResultKey,
  EvaluationRepository,
  SIGNAL_PREVIEW_RESULT_TTL_SECONDS,
  type SignalPreviewResult,
} from "@domain/evaluations"
import { exportSelectionSchema } from "@domain/exports"
import {
  ScoreAnalyticsRepository,
  ScoreRepository,
  type SignalDimension,
  type SignalEscalationThresholdBucket,
  type SignalWindowMetric,
} from "@domain/scores"
import {
  evaluationDraftSchema,
  type FilterCondition,
  type FilterSet,
  filterSetSchema,
  generateId,
  ProjectId,
  resolveSettings,
  SettingsReader,
  SignalId,
} from "@domain/shared"
import {
  type ApplySignalLifecycleCommandResult,
  applySignalLifecycleCommandUseCase,
  buildHistogramBucketScaffold,
  buildSignalGenerationResultKey,
  createSignalUseCase,
  DEFAULT_ESCALATION_SENSITIVITY_K,
  type DimensionPattern,
  deleteSignalUseCase,
  deriveSignalLifecycleStates,
  embedSignalSearchQueryUseCase,
  fillBuckets,
  getEscalationOccurrenceThreshold,
  getRelatedSignalsUseCase,
  getSignalImpactUseCase,
  type ListSignalsResult,
  listSignalsUseCase,
  type OrgSignalSearchItem,
  rankDimensionValues,
  SIGNAL_FEEDBACK_MAX_LENGTH,
  SIGNAL_GENERATION_PROMPT_MAX_LENGTH,
  SIGNAL_GENERATION_RESULT_TTL_SECONDS,
  type Signal,
  type SignalFeedback,
  type SignalGenerationResult,
  type SignalListItem,
  SignalRepository,
  searchOrgSignalsUseCase,
  signalAssigneeFilterSchema,
  signalLifecycleCommandSchema,
  signalPrioritySchema,
  signalsLifecycleGroupSchema,
  signalsSortDirectionSchema,
  signalsSortFieldSchema,
  submitSignalFeedbackUseCase,
  TAG_AGGREGATION_FALLBACK_DAYS,
  updateSignalEvaluationUseCase,
  updateSignalTriageUseCase,
  updateSignalUseCase,
} from "@domain/signals"
import { SessionRepository } from "@domain/spans"
import { AIEmbedLive, withAi } from "@platform/ai"
import { enforceExportRequestRateLimit } from "@platform/cache-redis"
import { ScoreAnalyticsRepositoryLive, SessionRepositoryLive, TraceRepositoryLive } from "@platform/db-clickhouse"
import {
  EvaluationRepositoryLive,
  MembershipRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  ScoreRepositoryLive,
  SettingsReaderLive,
  SignalRepositoryLive,
} from "@platform/db-postgres"
import { QuickJsScriptRuntimeLive } from "@platform/sandbox-quickjs"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { ensureSession } from "../../domains/sessions/session.functions.ts"
import { getSessionOrganizationId, requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient, getQueuePublisher, getRedisClient } from "../../server/clients.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"
import { withScopedPostgres } from "../../server/scoped-postgres.ts"
import {
  type EvaluationSummaryRecord,
  toEvaluationSummaryRecord,
} from "../evaluations/evaluation-alignment.functions.ts"
import { type SessionRecord, serializeSession } from "../sessions/sessions.functions.ts"
import { enforceSignalGenerationRateLimit } from "./signal-generation-rate-limit.ts"

const listSignalsInputSchema = z.object({
  projectId: z.string(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  lifecycleGroup: signalsLifecycleGroupSchema.optional(),
  assigneeIds: z.array(signalAssigneeFilterSchema).min(1).optional(),
  sort: z
    .object({
      field: signalsSortFieldSchema,
      direction: signalsSortDirectionSchema,
    })
    .optional(),
  searchQuery: z.string().max(500).optional(),
  timeRange: z
    .object({
      fromIso: z.iso.datetime().optional(),
      toIso: z.iso.datetime().optional(),
    })
    .optional(),
  histogramMaxSpanDays: z.number().int().positive().optional(),
})

const toSignalsBucketRecord = (bucket: { readonly bucket: string; readonly count: number }) => ({
  bucket: bucket.bucket,
  count: bucket.count,
})

const toSignalRecord = (issue: SignalListItem) => ({
  id: issue.id,
  slug: issue.slug,
  projectId: issue.projectId,
  name: issue.name,
  description: issue.description,
  source: issue.source,
  states: issue.states,
  assigneeId: issue.assigneeId,
  priority: issue.priority,
  createdAt: issue.createdAt.toISOString(),
  updatedAt: issue.updatedAt.toISOString(),
  resolvedAt: issue.resolvedAt?.toISOString() ?? null,
  ignoredAt: issue.ignoredAt?.toISOString() ?? null,
  regressedAt: issue.regressedAt?.toISOString() ?? null,
  mutedAt: issue.mutedAt?.toISOString() ?? null,
  firstSeenAt: issue.firstSeenAt.toISOString(),
  lastSeenAt: issue.lastSeenAt.toISOString(),
  occurrences: issue.occurrences,
  similarityScore: issue.similarityScore,
  affectedSessionsPercent: issue.affectedSessionsPercent,
  escalationOccurrenceThreshold: issue.escalationOccurrenceThreshold,
  trend: issue.trend.map(toSignalsBucketRecord),
  evaluations: issue.evaluations.map(toEvaluationSummaryRecord),
  tags: issue.tags,
})

export type SignalRecord = ReturnType<typeof toSignalRecord>

const toSignalsListResultRecord = (result: ListSignalsResult, viewerUserId: string) => ({
  analytics: {
    counts: result.analytics.counts,
    histogram: result.analytics.histogram.map(toSignalsBucketRecord),
    histogramBucketSeconds: result.analytics.histogramBucketSeconds,
    totalSessions: result.analytics.totalSessions,
  },
  items: result.items.map(toSignalRecord),
  totalCount: result.totalCount,
  hasMore: result.hasMore,
  hasAnySignals: result.hasAnySignals,
  limit: result.limit,
  offset: result.offset,
  occurrencesSum: result.occurrencesSum,
  priorityCounts: result.priorityCounts,
  // Resolved server-side from the per-assignee counts so the client never
  // receives the full assignee map; reflects every filter except the assignee
  // filter itself (see ListSignalsResult.assigneeCounts).
  mySignalsCount: result.assigneeCounts[viewerUserId] ?? 0,
})

export type SignalsListResultRecord = ReturnType<typeof toSignalsListResultRecord>

const signalRowMetricsInputSchema = z.object({
  projectId: z.string(),
  signalIds: z.array(z.string()).min(1).max(100),
  timeRange: z
    .object({
      fromIso: z.iso.datetime().optional(),
      toIso: z.iso.datetime().optional(),
    })
    .optional(),
})

export interface SignalRowMetricRecord {
  readonly occurrences: number
  readonly firstSeenAt: string | null
  readonly lastSeenAt: string | null
  readonly affectedSessionsPercent: number
  readonly trend: readonly ReturnType<typeof toSignalsBucketRecord>[]
}

export interface SignalRowMetricsRecord {
  readonly metricsBySignalId: Readonly<Record<string, SignalRowMetricRecord>>
}

export function toSignalRowMetricRecord({
  metric,
  totalSessions,
  trend,
}: {
  readonly metric: SignalWindowMetric | undefined
  readonly totalSessions: number
  readonly trend: readonly ReturnType<typeof toSignalsBucketRecord>[]
}): SignalRowMetricRecord {
  return {
    occurrences: metric?.occurrences ?? 0,
    firstSeenAt: metric?.firstSeenAt.toISOString() ?? null,
    lastSeenAt: metric?.lastSeenAt.toISOString() ?? null,
    affectedSessionsPercent: !metric || totalSessions === 0 ? 0 : Math.min(metric.affectedSessions / totalSessions, 1),
    trend,
  }
}

const signalInputSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
})

const toSignalSummaryRecord = (issue: Signal) => ({
  id: issue.id,
  slug: issue.slug,
  projectId: issue.projectId,
  name: issue.name,
  description: issue.description,
  source: issue.source,
  createdAt: issue.createdAt.toISOString(),
  updatedAt: issue.updatedAt.toISOString(),
  resolvedAt: issue.resolvedAt?.toISOString() ?? null,
  ignoredAt: issue.ignoredAt?.toISOString() ?? null,
  mutedAt: issue.mutedAt?.toISOString() ?? null,
})

export type SignalSummaryRecord = ReturnType<typeof toSignalSummaryRecord>

const signalDetailInputSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
})

const signalTracesInputSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})

const signalImpactInputSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
})

export interface SignalImpactRecord {
  readonly occurrences: number
  readonly affectedTraces: number
  readonly affectedSessions: number
  readonly affectedUsers: number
  readonly costMicrocents: number
  readonly tokens: number
  readonly totalProjectTraces: number
  readonly affectedTracesPercent: number
  readonly totalProjectSessions: number
  readonly affectedSessionsPercent: number
}

const updateSignalTriageInputSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
  // `undefined` (key omitted) leaves the field unchanged; `null` clears it; a value sets it.
  assigneeId: z.string().nullable().optional(),
  priority: signalPrioritySchema.nullable().optional(),
})

const signalDimensionSchema = z.enum([
  "model",
  "provider",
  "tool",
  "tag",
  "finishReason",
]) satisfies z.ZodType<SignalDimension>

const signalDimensionsInputSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
  dimension: signalDimensionSchema,
})

const signalOccurrencesInputSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
})

const relatedSignalsInputSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
})

// Cap on how many pinpointed example occurrences the carousel loads. Examples
// are for eyeballing a few representative failures, not exhaustive browsing
// (the Traces section covers full enumeration).
const SIGNAL_EXAMPLES_LIMIT = 30

const toUtcDayEnd = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999))

const SIGNAL_DETAIL_TREND_BUCKET_SECONDS = 12 * 60 * 60 // 12h

const toSignalDetailRecord = (input: {
  readonly issue: Signal
  readonly states: readonly string[]
  readonly firstSeenAt: Date | null
  readonly lastSeenAt: Date | null
  readonly totalOccurrences: number
  readonly escalationOccurrenceThreshold: number | null
  readonly trend: readonly { readonly bucket: string; readonly count: number }[]
  readonly trendBucketSeconds: number
  readonly trendEscalationThresholds: readonly SignalEscalationThresholdBucket[]
  readonly evaluations: readonly EvaluationSummaryRecord[]
  readonly tags: readonly string[]
  readonly flaggerSlugs: readonly string[]
  readonly keepMonitoringDefault: boolean
}) => ({
  id: input.issue.id,
  slug: input.issue.slug,
  projectId: input.issue.projectId,
  name: input.issue.name,
  description: input.issue.description,
  filters: input.issue.filters ?? null,
  source: input.issue.source,
  origin: input.issue.origin,
  assigneeId: input.issue.assigneeId,
  priority: input.issue.priority,
  states: input.states,
  createdAt: input.issue.createdAt.toISOString(),
  updatedAt: input.issue.updatedAt.toISOString(),
  resolvedAt: input.issue.resolvedAt?.toISOString() ?? null,
  ignoredAt: input.issue.ignoredAt?.toISOString() ?? null,
  regressedAt: input.issue.regressedAt?.toISOString() ?? null,
  mutedAt: input.issue.mutedAt?.toISOString() ?? null,
  feedback: input.issue.feedback,
  firstSeenAt: input.firstSeenAt?.toISOString() ?? null,
  lastSeenAt: input.lastSeenAt?.toISOString() ?? null,
  totalOccurrences: input.totalOccurrences,
  escalationOccurrenceThreshold: input.escalationOccurrenceThreshold,
  trend: input.trend,
  trendBucketSeconds: input.trendBucketSeconds,
  trendEscalationThresholds: input.trendEscalationThresholds,
  evaluations: input.evaluations,
  tags: input.tags,
  flaggerSlugs: input.flaggerSlugs,
  keepMonitoringDefault: input.keepMonitoringDefault,
})

export type SignalDetailRecord = ReturnType<typeof toSignalDetailRecord>

const signalLifecycleActionInputSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
  command: signalLifecycleCommandSchema,
  keepMonitoring: z.boolean().optional(),
})

const toSignalLifecycleCommandRecord = (result: ApplySignalLifecycleCommandResult) => ({
  command: result.command,
  keepMonitoring: result.keepMonitoring,
  items: result.items.map((item) => ({
    signalId: item.signalId,
    resolvedAt: item.resolvedAt?.toISOString() ?? null,
    ignoredAt: item.ignoredAt?.toISOString() ?? null,
    regressedAt: item.regressedAt?.toISOString() ?? null,
    mutedAt: item.mutedAt?.toISOString() ?? null,
    updatedAt: item.updatedAt.toISOString(),
    changed: item.changed,
  })),
})

type SignalLifecycleCommandRecord = ReturnType<typeof toSignalLifecycleCommandRecord>

type ListSignalsRequest = z.infer<typeof listSignalsInputSchema>

const runSignalsList = async (
  data: ListSignalsRequest,
  options: { readonly includeAnalytics: boolean; readonly includeItems?: boolean },
  context: Parameters<typeof resolveOrgScope>[0],
): Promise<SignalsListResultRecord> => {
  const { userId } = await requireSession()
  const orgId = await resolveOrgScope(context)
  const pgClient = getPostgresClient()
  const chClient = getClickhouseClient()
  const redisClient = getRedisClient()
  const trimmedSearchQuery = data.searchQuery?.trim() || undefined

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const directMatch = trimmedSearchQuery
        ? yield* Effect.gen(function* () {
            const signalRepo = yield* SignalRepository
            const [byId, bySlug] = yield* Effect.all(
              [
                signalRepo
                  .findById(SignalId(trimmedSearchQuery))
                  .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null))),
                signalRepo
                  .findBySlug({ projectId: ProjectId(data.projectId), slug: trimmedSearchQuery })
                  .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null))),
              ],
              { concurrency: 2 },
            )
            const idMatch = byId && byId.projectId === data.projectId ? byId : null
            return idMatch ?? bySlug
          })
        : null

      const search =
        options.includeAnalytics && trimmedSearchQuery && !directMatch
          ? yield* embedSignalSearchQueryUseCase({
              organizationId: orgId,
              projectId: data.projectId,
              query: trimmedSearchQuery,
            })
          : undefined

      const timeRange =
        data.timeRange?.fromIso || data.timeRange?.toIso
          ? {
              ...(data.timeRange?.fromIso ? { from: new Date(data.timeRange.fromIso) } : {}),
              ...(data.timeRange?.toIso ? { to: new Date(data.timeRange.toIso) } : {}),
            }
          : undefined

      return yield* listSignalsUseCase({
        organizationId: orgId,
        projectId: data.projectId,
        ...(data.limit !== undefined ? { limit: data.limit } : {}),
        ...(data.offset !== undefined ? { offset: data.offset } : {}),
        includeAnalytics: options.includeAnalytics,
        ...(options.includeItems !== undefined ? { includeItems: options.includeItems } : {}),
        ...(data.lifecycleGroup ? { lifecycleGroup: data.lifecycleGroup } : {}),
        ...(data.assigneeIds?.length ? { assigneeIds: data.assigneeIds } : {}),
        ...(data.sort ? { sort: data.sort } : {}),
        ...(timeRange ? { timeRange } : {}),
        ...(data.histogramMaxSpanDays ? { histogramMaxSpanDays: data.histogramMaxSpanDays } : {}),
        ...(directMatch
          ? { signalIds: [directMatch.id] }
          : search
            ? {
                search: {
                  query: search.query,
                  normalizedEmbedding: search.normalizedEmbedding,
                },
              }
            : trimmedSearchQuery
              ? { textSearchQuery: trimmedSearchQuery }
              : {}),
      })
    }).pipe(
      withScopedPostgres(Layer.mergeAll(SignalRepositoryLive, EvaluationRepositoryLive), pgClient, orgId),
      withScopedClickHouse(Layer.mergeAll(ScoreAnalyticsRepositoryLive, SessionRepositoryLive), chClient, orgId),
      withAi(AIEmbedLive, redisClient),
      withTracing,
    ),
  )

  return toSignalsListResultRecord(result, userId)
}

export const listSignals = createServerFn({ method: "GET" })
  .inputValidator(listSignalsInputSchema)
  .handler(
    async ({ data, context }): Promise<SignalsListResultRecord> =>
      runSignalsList(data, { includeAnalytics: false }, context),
  )

export const getSignalsAnalytics = createServerFn({ method: "GET" })
  .inputValidator(listSignalsInputSchema)
  .handler(
    async ({ data, context }): Promise<SignalsListResultRecord> =>
      runSignalsList(data, { includeAnalytics: true, includeItems: false }, context),
  )

export const getSignalRowMetrics = createServerFn({ method: "GET" })
  .inputValidator(signalRowMetricsInputSchema)
  .handler(async ({ data, context }): Promise<SignalRowMetricsRecord> => {
    const orgId = await resolveOrgScope(context)
    const chClient = getClickhouseClient()
    const timeRange =
      data.timeRange?.fromIso || data.timeRange?.toIso
        ? {
            ...(data.timeRange?.fromIso ? { from: new Date(data.timeRange.fromIso) } : {}),
            ...(data.timeRange?.toIso ? { to: new Date(data.timeRange.toIso) } : {}),
          }
        : undefined

    const trendTo = new Date(timeRange?.to ?? timeRange?.from ?? new Date())
    trendTo.setUTCHours(23, 59, 59, 999)
    const trendFrom = new Date(trendTo)
    trendFrom.setUTCDate(trendFrom.getUTCDate() - 13)
    trendFrom.setUTCHours(0, 0, 0, 0)
    const trendScaffold: string[] = []
    const trendCursor = new Date(trendFrom)
    while (trendCursor.getTime() <= trendTo.getTime()) {
      trendScaffold.push(trendCursor.toISOString().slice(0, 10))
      trendCursor.setUTCDate(trendCursor.getUTCDate() + 1)
    }

    return Effect.runPromise(
      Effect.gen(function* () {
        const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
        const sessionRepository = yield* SessionRepository
        const startTimeConditions: FilterCondition[] = []
        if (timeRange?.from) startTimeConditions.push({ op: "gte", value: timeRange.from.toISOString() })
        if (timeRange?.to) startTimeConditions.push({ op: "lte", value: timeRange.to.toISOString() })
        const sessionCountFilters: FilterSet | undefined =
          startTimeConditions.length > 0 ? { startTime: startTimeConditions } : undefined
        const signalIds = data.signalIds.map(SignalId)
        const [metrics, sessionCount, trendSeries] = yield* Effect.all([
          scoreAnalyticsRepository.listSignalWindowMetrics({
            organizationId: orgId,
            projectId: ProjectId(data.projectId),
            signalIds,
            ...(timeRange ? { timeRange } : {}),
          }),
          sessionRepository.countByProjectId({
            organizationId: orgId,
            projectId: ProjectId(data.projectId),
            ...(sessionCountFilters ? { filters: sessionCountFilters } : {}),
          }),
          scoreAnalyticsRepository.trendBySignals({
            organizationId: orgId,
            projectId: ProjectId(data.projectId),
            signalIds,
            timeRange: { from: trendFrom, to: trendTo },
          }),
        ])

        const metricsBySignalId = new Map(metrics.map((metric) => [metric.signalId as string, metric] as const))
        const trendBySignalId = new Map(
          trendSeries.map((series) => [
            series.signalId as string,
            fillBuckets({ scaffold: trendScaffold, buckets: series.buckets }).map(toSignalsBucketRecord),
          ]),
        )

        return {
          metricsBySignalId: Object.fromEntries(
            data.signalIds.map((signalId) => {
              const metric = metricsBySignalId.get(signalId)
              return [
                signalId,
                toSignalRowMetricRecord({
                  metric,
                  totalSessions: sessionCount.totalCount,
                  trend:
                    trendBySignalId.get(signalId) ??
                    fillBuckets({ scaffold: trendScaffold, buckets: [] }).map(toSignalsBucketRecord),
                }),
              ]
            }),
          ),
        } satisfies SignalRowMetricsRecord
      }).pipe(
        withScopedClickHouse(Layer.mergeAll(ScoreAnalyticsRepositoryLive, SessionRepositoryLive), chClient, orgId),
        withTracing,
      ),
    )
  })

export interface OrgSignalSearchRecord {
  readonly id: string
  readonly projectId: string
  readonly projectSlug: string
  readonly projectName: string
  readonly slug: string
  readonly name: string
  readonly states: readonly string[]
}

const toOrgSignalSearchRecord = (item: OrgSignalSearchItem): OrgSignalSearchRecord => ({
  id: item.id,
  projectId: item.projectId,
  projectSlug: item.projectSlug,
  projectName: item.projectName,
  slug: item.slug,
  name: item.name,
  states: item.states,
})

/**
 * Org-wide issue search for the Command Palette. Unlike {@link listSignals} (a project-scoped
 * analytics pipeline), this is a lightweight search across every project in the caller's
 * organization. The lexical tier runs always; the semantic tier runs only when `semantic` is set
 * (the debounced call), embedding the query first. Each result carries its owning project's
 * slug/name and derived lifecycle states. Muted issues are excluded.
 */
export const searchOrgSignals = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      searchQuery: z.string().min(1).max(500),
      semantic: z.boolean().optional(),
      preferProjectId: z.string().optional(),
      limit: z.number().int().min(1).max(25).optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<readonly OrgSignalSearchRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()
    const redisClient = getRedisClient()

    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const search = data.semantic
          ? yield* embedSignalSearchQueryUseCase({
              organizationId: orgId,
              // Org-wide search has no single project; `projectId` is telemetry-only on this
              // use-case (it does not scope the embedding), so we tag it with the org id.
              projectId: orgId,
              query: data.searchQuery,
            })
          : undefined

        return yield* searchOrgSignalsUseCase({
          organizationId: orgId,
          query: data.searchQuery,
          ...(search ? { normalizedEmbedding: search.normalizedEmbedding } : {}),
          ...(data.preferProjectId !== undefined ? { preferProjectId: ProjectId(data.preferProjectId) } : {}),
          ...(data.limit !== undefined ? { limit: data.limit } : {}),
        })
      }).pipe(withScopedPostgres(SignalRepositoryLive, pgClient, orgId), withAi(AIEmbedLive, redisClient), withTracing),
    )

    return results.map(toOrgSignalSearchRecord)
  })

export const getSignal = createServerFn({ method: "GET" })
  .inputValidator(signalInputSchema)
  .handler(async ({ data, context }): Promise<SignalSummaryRecord | null> => {
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()
    const projectId = ProjectId(data.projectId)
    const signalId = SignalId(data.signalId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository
        const issues = yield* signalRepository.findByIds({
          projectId,
          signalIds: [signalId],
        })
        const issue = issues[0]

        return issue ? toSignalSummaryRecord(issue) : null
      }).pipe(withScopedPostgres(SignalRepositoryLive, pgClient, orgId), withTracing),
    )
  })

/**
 * Resolves the URL's signal `slug` to its stable CUID id. The detail route is
 * addressed by the human-facing slug, but the detail data lives in ClickHouse
 * keyed by the id, the page's many child queries share one id-keyed cache entry,
 * and `SignalDetailBody`/`SignalLifecycleActions` are also reused in the session
 * drawer with only a CUID — so the route resolves the slug once here and threads
 * the id down (the same slug→entity→id shape projects use).
 */
export const getSignalIdBySlug = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), signalSlug: z.string() }))
  .handler(async ({ data, context }): Promise<{ readonly signalId: string } | null> => {
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()
    const projectId = ProjectId(data.projectId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository
        return yield* signalRepository.findBySlug({ projectId, slug: data.signalSlug }).pipe(
          Effect.map((issue) => ({ signalId: issue.id })),
          Effect.catchTag("NotFoundError", () =>
            signalRepository.findById(SignalId(data.signalSlug)).pipe(
              Effect.map((issue) => (issue.projectId === data.projectId ? { signalId: issue.id } : null)),
              Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
            ),
          ),
        )
      }).pipe(withScopedPostgres(SignalRepositoryLive, pgClient, orgId), withTracing),
    )
  })

export interface SignalLifecycleSummaryRecord {
  readonly id: string
  readonly name: string
  readonly states: readonly string[]
}

/**
 * Tiny "name + current status" lookup used by the in-app notifications card
 * to refresh the snapshot the bell stored at notification-creation time.
 * Cheap on purpose — no occurrences/trend/evaluations like getSignalDetail.
 */
export const getSignalLifecycleSummary = createServerFn({ method: "GET" })
  .inputValidator(signalInputSchema)
  .handler(async ({ data, context }): Promise<SignalLifecycleSummaryRecord | null> => {
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()
    const projectId = ProjectId(data.projectId)
    const signalId = SignalId(data.signalId)
    const now = new Date()

    return Effect.runPromise(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository
        const issues = yield* signalRepository.findByIds({ projectId, signalIds: [signalId] })
        const issue = issues[0]
        if (!issue) return null

        const states = deriveSignalLifecycleStates({
          issue,
          isEscalating: issue.lifecycle.isEscalating,
          now,
        })
        return { id: issue.id, name: issue.name, states: [...states] }
      }).pipe(withScopedPostgres(SignalRepositoryLive, pgClient, orgId), withTracing),
    )
  })

export const getSignalDetail = createServerFn({ method: "GET" })
  .inputValidator(signalDetailInputSchema)
  .handler(async ({ data, context }): Promise<SignalDetailRecord | null> => {
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()
    const chClient = getClickhouseClient()
    const projectId = ProjectId(data.projectId)
    const signalId = SignalId(data.signalId)
    const now = new Date()

    return Effect.runPromise(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository
        const evaluationRepository = yield* EvaluationRepository
        const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
        const scoreRepository = yield* ScoreRepository
        const settingsReader = yield* SettingsReader

        const issues = yield* signalRepository.findByIds({
          projectId,
          signalIds: [signalId],
        })
        const issue = issues[0]

        if (!issue) {
          return null
        }

        const trendTo = toUtcDayEnd(now)
        const trendFrom = new Date(trendTo)
        trendFrom.setUTCDate(trendFrom.getUTCDate() - 13)
        trendFrom.setUTCHours(0, 0, 0, 0)
        const trendScaffold = buildHistogramBucketScaffold({
          from: trendFrom,
          to: trendTo,
          bucketSeconds: SIGNAL_DETAIL_TREND_BUCKET_SECONDS,
        })

        // Match the listSignalsUseCase tag-aggregation window so the drawer
        // and the table show a consistent set of tags for the same issue.
        const tagsFrom = new Date(now)
        tagsFrom.setUTCDate(tagsFrom.getUTCDate() - TAG_AGGREGATION_FALLBACK_DAYS)

        // `escalation.sensitivity` is the user-facing `k_short` knob on the
        // seasonal detector — read raw here (not via `resolveSettings`) since
        // the cascade only surfaces `keepMonitoring` today.
        // TODO: Remove this after releasing monitors for everybody — the knob
        // moves onto the system "Signal escalating" monitor's alert condition.
        const projectSettings = yield* settingsReader.getProjectSettings(projectId)
        const kShort = projectSettings?.escalation?.sensitivity ?? DEFAULT_ESCALATION_SENSITIVITY_K

        // Only flagger-sourced issues need the slug query — annotation/custom issues
        // never carry a `metadata.flaggerSlug` so we skip the Postgres read entirely.
        const flaggerSlugsEffect =
          issue.source === "flagger"
            ? scoreRepository.listFlaggerSlugsBySignalId({ projectId, signalId: issue.id })
            : Effect.succeed<readonly string[]>([])

        const [occurrences, trend, thresholdSeries, evaluationPage, tagsAggregates, flaggerSlugs, settings] =
          yield* Effect.all([
            scoreAnalyticsRepository.aggregateBySignals({
              organizationId: orgId,
              projectId,
              signalIds: [issue.id],
            }),
            scoreAnalyticsRepository.trendBySignal({
              organizationId: orgId,
              projectId,
              signalId: issue.id,
              days: 14,
              bucketSeconds: SIGNAL_DETAIL_TREND_BUCKET_SECONDS,
            }),
            scoreAnalyticsRepository.escalationThresholdHistogramBySignals({
              organizationId: orgId,
              projectId,
              signalIds: [issue.id],
              timeRange: { from: trendFrom, to: trendTo },
              bucketSeconds: SIGNAL_DETAIL_TREND_BUCKET_SECONDS,
              kShort,
            }),
            evaluationRepository.listBySignalId({
              projectId,
              signalId: issue.id,
              options: {
                lifecycle: "active",
                limit: 1000,
              },
            }),
            scoreAnalyticsRepository.aggregateTagsBySignals({
              organizationId: orgId,
              projectId,
              signalIds: [issue.id],
              timeRange: { from: tagsFrom, to: now },
            }),
            flaggerSlugsEffect,
            resolveSettings({ projectId }),
          ])

        const occurrence = occurrences[0] ?? null
        const thresholdBuckets = thresholdSeries[0]?.buckets ?? []

        return toSignalDetailRecord({
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
          trend: fillBuckets({
            scaffold: trendScaffold,
            buckets: trend,
          }),
          trendBucketSeconds: SIGNAL_DETAIL_TREND_BUCKET_SECONDS,
          trendEscalationThresholds: thresholdBuckets,
          evaluations: evaluationPage.items.map(toEvaluationSummaryRecord),
          tags: tagsAggregates[0]?.tags ?? [],
          flaggerSlugs,
          keepMonitoringDefault: settings.keepMonitoring,
        })
      }).pipe(
        withScopedPostgres(
          Layer.mergeAll(SignalRepositoryLive, EvaluationRepositoryLive, ScoreRepositoryLive, SettingsReaderLive),
          pgClient,
          orgId,
        ),
        withScopedClickHouse(ScoreAnalyticsRepositoryLive, chClient, orgId),
        withTracing,
      ),
    )
  })

const toSignalSessionPageRecord = (input: {
  readonly items: readonly SessionRecord[]
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}) => input

export type SignalSessionPageRecord = ReturnType<typeof toSignalSessionPageRecord>

export const listSignalSessions = createServerFn({ method: "GET" })
  .inputValidator(signalTracesInputSchema)
  .handler(async ({ data, context }): Promise<SignalSessionPageRecord> => {
    const orgId = await resolveOrgScope(context)
    const chClient = getClickhouseClient()
    const projectId = ProjectId(data.projectId)
    const signalId = SignalId(data.signalId)

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
        const sessionRepository = yield* SessionRepository
        const sessionPage = yield* scoreAnalyticsRepository.listSessionsBySignal({
          organizationId: orgId,
          projectId,
          signalId,
          ...(data.limit !== undefined ? { limit: data.limit } : {}),
          ...(data.offset !== undefined ? { offset: data.offset } : {}),
        })
        const sessions = yield* sessionRepository.listBySessionIds({
          organizationId: orgId,
          projectId,
          sessionIds: sessionPage.items.map((item) => item.sessionId),
        })
        const sessionsById = new Map(sessions.map((session) => [session.sessionId, session]))
        return {
          items: sessionPage.items.flatMap((item) => {
            const session = sessionsById.get(item.sessionId)
            return session ? [serializeSession(session)] : []
          }),
          hasMore: sessionPage.hasMore,
          limit: sessionPage.limit,
          offset: sessionPage.offset,
        }
      }).pipe(
        withScopedClickHouse(Layer.mergeAll(ScoreAnalyticsRepositoryLive, SessionRepositoryLive), chClient, orgId),
      ),
    )

    return toSignalSessionPageRecord(result)
  })

export const countSignalSessions = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), signalId: z.string() }))
  .handler(async ({ data, context }): Promise<number> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      Effect.gen(function* () {
        const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
        return yield* scoreAnalyticsRepository.countSessionsBySignal({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          signalId: SignalId(data.signalId),
        })
      }).pipe(withScopedClickHouse(ScoreAnalyticsRepositoryLive, getClickhouseClient(), orgId)),
    )
  })

export const getSignalImpact = createServerFn({ method: "GET" })
  .inputValidator(signalImpactInputSchema)
  .handler(async ({ data, context }): Promise<SignalImpactRecord> => {
    const orgId = await resolveOrgScope(context)
    const chClient = getClickhouseClient()
    const projectId = ProjectId(data.projectId)
    const signalId = SignalId(data.signalId)

    return Effect.runPromise(
      getSignalImpactUseCase({ organizationId: orgId, projectId, signalId }).pipe(
        withScopedClickHouse(
          Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive, SessionRepositoryLive),
          chClient,
          orgId,
        ),
        withTracing,
      ),
    )
  })

export interface SignalDimensionsRecord {
  readonly dimension: SignalDimension
  /** Signal's unconditional trace incidence — the reference each pattern's `conditionalRate` is judged against. */
  readonly baseRate: number
  readonly signalAffectedTraces: number
  /** Support-gated, rate-elevation–ranked values (most over-represented first). */
  readonly patterns: readonly DimensionPattern[]
}

export const getSignalDimensions = createServerFn({ method: "GET" })
  .inputValidator(signalDimensionsInputSchema)
  .handler(async ({ data, context }): Promise<SignalDimensionsRecord> => {
    const orgId = await resolveOrgScope(context)
    const chClient = getClickhouseClient()
    const projectId = ProjectId(data.projectId)
    const signalId = SignalId(data.signalId)

    const comparison = await Effect.runPromise(
      Effect.gen(function* () {
        const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
        return yield* scoreAnalyticsRepository.aggregateDimensionBySignal({
          organizationId: orgId,
          projectId,
          signalId,
          dimension: data.dimension,
        })
      }).pipe(withScopedClickHouse(ScoreAnalyticsRepositoryLive, chClient, orgId), withTracing),
    )

    return {
      dimension: comparison.dimension,
      baseRate: comparison.baseRate,
      signalAffectedTraces: comparison.signalAffectedTraces,
      patterns: rankDimensionValues(comparison),
    }
  })

/** One Related-list row: why another issue relates to this one, plus identity to render/link it. */
export interface RelatedSignalRecord {
  readonly signalId: string
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly states: readonly string[]
  readonly occurrences: number
  readonly lastSeenAt: string | null
  /** Combined ranking score — sort-order only, never displayed. */
  readonly relatedness: number
  /** Present when the semantic (centroid cosine) signal contributed. */
  readonly semantic: {
    readonly similarity: number
    readonly score: number
  } | null
  /** Present when the session co-occurrence signal contributed. */
  readonly coOccurrence: {
    readonly sharedSessions: number
    readonly sharedSessionsPercent: number
    readonly score: number
  } | null
}

export const getRelatedSignals = createServerFn({ method: "GET" })
  .inputValidator(relatedSignalsInputSchema)
  .handler(async ({ data, context }): Promise<readonly RelatedSignalRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()
    const chClient = getClickhouseClient()

    const related = await Effect.runPromise(
      getRelatedSignalsUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        signalId: SignalId(data.signalId),
      }).pipe(
        withScopedPostgres(SignalRepositoryLive, pgClient, orgId),
        withScopedClickHouse(ScoreAnalyticsRepositoryLive, chClient, orgId),
        withTracing,
      ),
    )

    return related.map(
      (row): RelatedSignalRecord => ({
        signalId: row.signalId,
        slug: row.slug,
        name: row.name,
        description: row.description,
        states: row.states,
        occurrences: row.occurrences,
        lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
        relatedness: row.relatedness,
        semantic: row.semantic,
        coOccurrence: row.coOccurrence,
      }),
    )
  })

/** An occurrence (annotation score) that pinpoints where the issue manifests in a conversation. */
export interface SignalOccurrenceRecord {
  readonly scoreId: string
  readonly traceId: string
  readonly feedback: string
  readonly createdAt: string
  readonly annotatorId: string | null
  /** Set when an automatic flagger authored the annotation (so the UI can attribute it). */
  readonly flaggerSlug: string | null
  /** Location of the flagged content in the trace's canonical conversation. */
  readonly anchor: {
    readonly messageIndex: number
    readonly partIndex: number | null
    readonly startOffset: number | null
    readonly endOffset: number | null
    readonly textFormat: string | null
  }
}

/**
 * Lists an issue's occurrences that pinpoint a culprit — published annotation
 * scores carrying a `messageIndex` anchor and a trace to render. These are the
 * examples the page cycles through, highlighting the exact message/substring.
 */
export const getSignalOccurrences = createServerFn({ method: "GET" })
  .inputValidator(signalOccurrencesInputSchema)
  .handler(async ({ data, context }): Promise<{ readonly items: readonly SignalOccurrenceRecord[] }> => {
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()
    const projectId = ProjectId(data.projectId)
    const signalId = SignalId(data.signalId)

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        const scoreRepository = yield* ScoreRepository
        return yield* scoreRepository.listBySignalId({
          projectId,
          signalId,
          source: "annotation",
          options: { limit: SIGNAL_EXAMPLES_LIMIT, draftMode: "exclude" },
        })
      }).pipe(withScopedPostgres(ScoreRepositoryLive, pgClient, orgId), withTracing),
    )

    const items = page.items.flatMap((score): SignalOccurrenceRecord[] => {
      // Only annotation scores carry message anchors; skip occurrences without a
      // trace to render or without a pinpointed message.
      if (score.sourceType !== "annotation" || score.traceId === null || score.metadata.messageIndex === undefined) {
        return []
      }
      const { messageIndex, partIndex, startOffset, endOffset, textFormat, flaggerSlug } = score.metadata
      return [
        {
          scoreId: score.id,
          traceId: score.traceId,
          feedback: score.feedback,
          createdAt: score.createdAt.toISOString(),
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

    return { items }
  })

export interface UpdateSignalTriageRecord {
  readonly signalId: string
  readonly assigneeId: string | null
  readonly priority: z.infer<typeof signalPrioritySchema> | null
  readonly updatedAt: string
  readonly changed: boolean
}

export const updateSignalTriage = createServerFn({ method: "POST" })
  .inputValidator(updateSignalTriageInputSchema)
  .handler(async ({ data, context }): Promise<UpdateSignalTriageRecord> => {
    const { userId } = await requireSession()
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()

    const result = await Effect.runPromise(
      updateSignalTriageUseCase({
        projectId: data.projectId,
        signalId: SignalId(data.signalId),
        actorUserId: userId,
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
      }).pipe(
        withScopedPostgres(
          Layer.mergeAll(SignalRepositoryLive, MembershipRepositoryLive, OutboxEventWriterLive),
          pgClient,
          orgId,
        ),
        withTracing,
      ),
    )

    return {
      signalId: result.signalId,
      assigneeId: result.assigneeId,
      priority: result.priority,
      updatedAt: result.updatedAt.toISOString(),
      changed: result.changed,
    }
  })

export const applySignalLifecycleAction = createServerFn({ method: "POST" })
  .inputValidator(signalLifecycleActionInputSchema)
  .handler(async ({ data, context }): Promise<SignalLifecycleCommandRecord> => {
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()

    const result = await Effect.runPromise(
      applySignalLifecycleCommandUseCase({
        projectId: data.projectId,
        signalIds: [data.signalId],
        command: data.command,
        keepMonitoring: data.keepMonitoring,
      }).pipe(
        withScopedPostgres(
          Layer.mergeAll(SignalRepositoryLive, EvaluationRepositoryLive, OutboxEventWriterLive, SettingsReaderLive),
          pgClient,
          orgId,
        ),
        withTracing,
      ),
    )

    return toSignalLifecycleCommandRecord(result)
  })

const submitSignalFeedbackInputSchema = z
  .object({
    projectId: z.string(),
    signalId: z.string(),
    passed: z.boolean(),
    feedback: z.string().max(SIGNAL_FEEDBACK_MAX_LENGTH).optional(),
    ignore: z.boolean().optional(),
  })
  .refine((input) => input.passed || (input.feedback?.trim().length ?? 0) > 0, {
    message: "A reason is required when reporting a signal as a false positive",
    path: ["feedback"],
  })

export const submitSignalFeedback = createServerFn({ method: "POST" })
  .inputValidator(submitSignalFeedbackInputSchema)
  .handler(async ({ data, context }): Promise<{ readonly feedback: SignalFeedback; readonly ignored: boolean }> => {
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()

    const result = await Effect.runPromise(
      submitSignalFeedbackUseCase({
        projectId: data.projectId,
        signalId: SignalId(data.signalId),
        passed: data.passed,
        ...(data.feedback !== undefined ? { feedback: data.feedback } : {}),
        ...(data.ignore !== undefined ? { ignore: data.ignore } : {}),
      }).pipe(
        withScopedPostgres(
          Layer.mergeAll(SignalRepositoryLive, EvaluationRepositoryLive, OutboxEventWriterLive, SettingsReaderLive),
          pgClient,
          orgId,
        ),
        withTracing,
      ),
    )

    return { feedback: result.feedback, ignored: result.ignored }
  })

const bulkSignalLifecycleActionInputSchema = z.object({
  projectId: z.string(),
  selection: exportSelectionSchema,
  command: signalLifecycleCommandSchema,
  keepMonitoring: z.boolean().optional(),
  lifecycleGroup: signalsLifecycleGroupSchema.optional(),
  assigneeIds: z.array(signalAssigneeFilterSchema).min(1).optional(),
  sort: z
    .object({
      field: signalsSortFieldSchema,
      direction: signalsSortDirectionSchema,
    })
    .optional(),
  searchQuery: z.string().max(500).optional(),
  timeRange: z
    .object({
      fromIso: z.iso.datetime().optional(),
      toIso: z.iso.datetime().optional(),
    })
    .optional(),
})

const BULK_ACTION_BATCH_SIZE = 100

export const applyBulkSignalLifecycleAction = createServerFn({ method: "POST" })
  .inputValidator(bulkSignalLifecycleActionInputSchema)
  .handler(async ({ data, context }): Promise<SignalLifecycleCommandRecord> => {
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()
    const chClient = getClickhouseClient()
    const redisClient = getRedisClient()
    const trimmedSearchQuery = data.searchQuery?.trim() || undefined

    const signalIds: string[] = []

    if (data.selection.mode === "selected") {
      signalIds.push(...data.selection.rowIds)
    } else {
      const selectionIds = data.selection.mode === "allExcept" ? new Set(data.selection.rowIds) : null

      await Effect.runPromise(
        Effect.gen(function* () {
          const search = trimmedSearchQuery
            ? yield* embedSignalSearchQueryUseCase({
                organizationId: orgId,
                projectId: data.projectId,
                query: trimmedSearchQuery,
              })
            : undefined

          const timeRange =
            data.timeRange?.fromIso || data.timeRange?.toIso
              ? {
                  ...(data.timeRange?.fromIso ? { from: new Date(data.timeRange.fromIso) } : {}),
                  ...(data.timeRange?.toIso ? { to: new Date(data.timeRange.toIso) } : {}),
                }
              : undefined

          let offset = 0
          while (true) {
            const page = yield* listSignalsUseCase({
              organizationId: orgId,
              projectId: data.projectId,
              limit: BULK_ACTION_BATCH_SIZE,
              offset,
              includeAnalytics: false,
              ...(data.lifecycleGroup ? { lifecycleGroup: data.lifecycleGroup } : {}),
              ...(data.assigneeIds?.length ? { assigneeIds: data.assigneeIds } : {}),
              ...(data.sort ? { sort: data.sort } : {}),
              ...(timeRange ? { timeRange } : {}),
              ...(search
                ? {
                    search: {
                      query: search.query,
                      normalizedEmbedding: search.normalizedEmbedding,
                    },
                  }
                : {}),
            })

            if (page.items.length === 0) break

            for (const issue of page.items) {
              if (data.selection.mode === "allExcept" && selectionIds?.has(issue.id)) {
                continue
              }
              signalIds.push(issue.id)
            }

            if (!page.hasMore) break
            offset += page.limit
          }
        }).pipe(
          withScopedPostgres(Layer.mergeAll(SignalRepositoryLive, EvaluationRepositoryLive), pgClient, orgId),
          withScopedClickHouse(Layer.mergeAll(ScoreAnalyticsRepositoryLive, SessionRepositoryLive), chClient, orgId),
          withAi(AIEmbedLive, redisClient),
          withTracing,
        ),
      )
    }

    if (signalIds.length === 0) {
      return {
        command: data.command,
        keepMonitoring: null,
        items: [],
      }
    }

    const result = await Effect.runPromise(
      applySignalLifecycleCommandUseCase({
        projectId: data.projectId,
        signalIds,
        command: data.command,
        keepMonitoring: data.keepMonitoring,
      }).pipe(
        withScopedPostgres(
          Layer.mergeAll(SignalRepositoryLive, EvaluationRepositoryLive, OutboxEventWriterLive, SettingsReaderLive),
          pgClient,
          orgId,
        ),
        withTracing,
      ),
    )

    return toSignalLifecycleCommandRecord(result)
  })

interface EnqueuedExportResult {
  readonly type: "enqueued"
}

export const enqueueSignalsExport = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      selection: exportSelectionSchema.optional(),
      lifecycleGroup: signalsLifecycleGroupSchema.optional(),
      assigneeIds: z.array(signalAssigneeFilterSchema).min(1).optional(),
      sort: z
        .object({
          field: signalsSortFieldSchema,
          direction: signalsSortDirectionSchema,
        })
        .optional(),
      searchQuery: z.string().max(500).optional(),
      timeRange: z
        .object({
          fromIso: z.iso.datetime().optional(),
          toIso: z.iso.datetime().optional(),
        })
        .optional(),
    }),
  )
  .handler(async ({ data }): Promise<EnqueuedExportResult> => {
    const session = await ensureSession()
    const email = session?.user?.email
    const organizationId = getSessionOrganizationId(session)

    if (!organizationId || !email) {
      throw new Error("Unauthorized")
    }

    await enforceExportRequestRateLimit({
      redis: getRedisClient(),
      organizationId,
      projectId: data.projectId,
      recipientEmail: email,
    })

    const publisher = await getQueuePublisher()
    const exportTimeRange =
      data.timeRange?.fromIso || data.timeRange?.toIso
        ? {
            ...(data.timeRange?.fromIso ? { fromIso: data.timeRange.fromIso } : {}),
            ...(data.timeRange?.toIso ? { toIso: data.timeRange.toIso } : {}),
          }
        : undefined

    await Effect.runPromise(
      publisher.publish("exports", "generate", {
        kind: "issues",
        organizationId,
        projectId: data.projectId,
        recipientEmail: email,
        ...(data.selection ? { selection: data.selection } : {}),
        ...(data.lifecycleGroup ? { lifecycleGroup: data.lifecycleGroup } : {}),
        ...(data.assigneeIds?.length ? { assigneeIds: data.assigneeIds } : {}),
        ...(data.sort ? { sort: data.sort } : {}),
        ...(data.searchQuery ? { searchQuery: data.searchQuery } : {}),
        ...(exportTimeRange ? { timeRange: exportTimeRange } : {}),
      }),
    )

    return { type: "enqueued" }
  })

// --- Builder: create / edit / delete / preview (web leads; no REST/SDK regen) ---

const createSignalInputSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1),
  description: z.string().min(1),
  priority: signalPrioritySchema.nullish(),
  filters: filterSetSchema.nullish(),
  sampling: z.number().int().min(0).max(100).optional(),
  evaluation: evaluationDraftSchema,
})

export interface CreateSignalRecord {
  readonly signalId: string
  readonly slug: string
  readonly evaluationId: string
}

/** Creates a user-origin signal with its membership detector (settings or raw script). */
export const createSignal = createServerFn({ method: "POST" })
  .inputValidator(createSignalInputSchema)
  .handler(async ({ data, context }): Promise<CreateSignalRecord> => {
    const organizationId = await resolveOrgScope(context)
    const client = getPostgresClient()

    return Effect.runPromise(
      createSignalUseCase({
        organizationId,
        projectId: data.projectId,
        name: data.name,
        description: data.description,
        ...(data.priority != null ? { priority: data.priority } : {}),
        ...(data.filters != null ? { filters: data.filters } : {}),
        ...(data.sampling !== undefined ? { sampling: data.sampling } : {}),
        evaluation: data.evaluation,
      }).pipe(
        withScopedPostgres(
          Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive, EvaluationRepositoryLive, OutboxEventWriterLive),
          client,
          organizationId,
        ),
        Effect.provide(QuickJsScriptRuntimeLive),
        withTracing,
      ),
    )
  })

const updateSignalInputSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  filters: filterSetSchema.nullable().optional(),
})

/** Updates a signal's name/description and its canonical `filters` pre-gate. */
export const updateSignal = createServerFn({ method: "POST" })
  .inputValidator(updateSignalInputSchema)
  .handler(async ({ data, context }): Promise<{ readonly signalId: string; readonly changed: boolean }> => {
    const organizationId = await resolveOrgScope(context)
    const client = getPostgresClient()

    return Effect.runPromise(
      updateSignalUseCase({
        projectId: data.projectId,
        signalId: data.signalId,
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.filters !== undefined ? { filters: data.filters } : {}),
      }).pipe(
        withScopedPostgres(Layer.mergeAll(SignalRepositoryLive, EvaluationRepositoryLive), client, organizationId),
        withTracing,
      ),
    )
  })

const updateSignalEvaluationInputSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
  evaluation: evaluationDraftSchema,
  sampling: z.number().int().min(0).max(100).optional(),
})

/** Recompiles a user signal's evaluation in place — from a settings form, or a raw script (Advanced tab). */
export const updateSignalEvaluation = createServerFn({ method: "POST" })
  .inputValidator(updateSignalEvaluationInputSchema)
  .handler(
    async ({
      data,
      context,
    }): Promise<{ readonly signalId: string; readonly evaluationId: string; readonly changed: boolean }> => {
      const organizationId = await resolveOrgScope(context)
      const client = getPostgresClient()

      return Effect.runPromise(
        updateSignalEvaluationUseCase({
          projectId: data.projectId,
          signalId: data.signalId,
          evaluation: data.evaluation,
          ...(data.sampling !== undefined ? { sampling: data.sampling } : {}),
        }).pipe(
          withScopedPostgres(Layer.mergeAll(SignalRepositoryLive, EvaluationRepositoryLive), client, organizationId),
          Effect.provide(QuickJsScriptRuntimeLive),
          withTracing,
        ),
      )
    },
  )

const deleteSignalInputSchema = z.object({ projectId: z.string(), signalId: z.string() })

/** Soft-deletes a signal and archives its evaluation. */
export const deleteSignal = createServerFn({ method: "POST" })
  .inputValidator(deleteSignalInputSchema)
  .handler(async ({ data, context }): Promise<{ readonly signalId: string }> => {
    const organizationId = await resolveOrgScope(context)
    const client = getPostgresClient()

    return Effect.runPromise(
      deleteSignalUseCase({ projectId: data.projectId, signalId: data.signalId }).pipe(
        withScopedPostgres(Layer.mergeAll(SignalRepositoryLive, EvaluationRepositoryLive), client, organizationId),
        withTracing,
      ),
    )
  })

const previewEvaluationInputSchema = z.object({
  projectId: z.string(),
  filters: filterSetSchema.nullish(),
  evaluation: evaluationDraftSchema,
})

/**
 * Enqueues an on-demand preview run (latest matching sessions, no persist) and returns a
 * `previewId` to poll via `getSignalPreviewResult`. The run executes in the `signals-preview`
 * worker (the single path with AI + sandbox + ClickHouse); the result is written to Redis.
 */
export const previewEvaluation = createServerFn({ method: "POST" })
  .inputValidator(previewEvaluationInputSchema)
  .handler(async ({ data }): Promise<{ readonly previewId: string }> => {
    const { organizationId } = await requireSession()
    const previewId = generateId<"SignalPreview">()
    const redis = getRedisClient()

    await redis.set(
      buildSignalPreviewResultKey(organizationId, previewId),
      JSON.stringify({ status: "pending" } satisfies SignalPreviewResult),
      "EX",
      SIGNAL_PREVIEW_RESULT_TTL_SECONDS,
    )

    const publisher = await getQueuePublisher()
    await Effect.runPromise(
      publisher.publish("signals-preview", "run", {
        previewId,
        organizationId,
        projectId: data.projectId,
        evaluation: data.evaluation,
        ...(data.filters != null ? { filters: data.filters } : {}),
      }),
    )

    return { previewId }
  })

const getSignalPreviewResultInputSchema = z.object({ previewId: z.string() })

/** Polls a preview run's result. Returns `pending` while the worker is still running (or the key expired). */
export const getSignalPreviewResult = createServerFn({ method: "GET" })
  .inputValidator(getSignalPreviewResultInputSchema)
  .handler(async ({ data }): Promise<SignalPreviewResult> => {
    const { organizationId } = await requireSession()
    const redis = getRedisClient()
    const raw = await redis.get(buildSignalPreviewResultKey(organizationId, data.previewId))
    return raw === null ? { status: "pending" } : (JSON.parse(raw) as SignalPreviewResult)
  })

const generateSignalInputSchema = z.object({
  projectId: z.string(),
  prompt: z.string().min(1).max(SIGNAL_GENERATION_PROMPT_MAX_LENGTH),
  filters: filterSetSchema.nullish(),
})

/**
 * Enqueues a describe-first signal generation and returns a `generationId` to poll via
 * `getSignalGenerationResult`. It runs in the `signals-generate-signal` worker (AI + sandbox +
 * ClickHouse + Postgres — never inline), which drafts the complete signal grounded in observed
 * project data, previews it against recent sessions, and creates it. The prompt is not persisted.
 */
export const generateSignal = createServerFn({ method: "POST" })
  .inputValidator(generateSignalInputSchema)
  .handler(async ({ data }): Promise<{ readonly generationId: string }> => {
    const { organizationId } = await requireSession()
    const generationId = generateId<"SignalGeneration">()
    const redis = getRedisClient()

    await enforceSignalGenerationRateLimit({ redis, organizationId, projectId: data.projectId })

    await redis.set(
      buildSignalGenerationResultKey(organizationId, generationId),
      JSON.stringify({ status: "pending" } satisfies SignalGenerationResult),
      "EX",
      SIGNAL_GENERATION_RESULT_TTL_SECONDS,
    )

    const publisher = await getQueuePublisher()
    await Effect.runPromise(
      publisher.publish("signals-generate-signal", "run", {
        generationId,
        organizationId,
        projectId: data.projectId,
        prompt: data.prompt,
        ...(data.filters != null ? { filters: data.filters } : {}),
      }),
    )

    return { generationId }
  })

const getSignalGenerationResultInputSchema = z.object({ generationId: z.string() })

/** Polls a signal-generation run's result. Returns `pending` while the worker is still running (or the key expired). */
export const getSignalGenerationResult = createServerFn({ method: "GET" })
  .inputValidator(getSignalGenerationResultInputSchema)
  .handler(async ({ data }): Promise<SignalGenerationResult> => {
    const { organizationId } = await requireSession()
    const redis = getRedisClient()
    const raw = await redis.get(buildSignalGenerationResultKey(organizationId, data.generationId))
    return raw === null ? { status: "pending" } : (JSON.parse(raw) as SignalGenerationResult)
  })
