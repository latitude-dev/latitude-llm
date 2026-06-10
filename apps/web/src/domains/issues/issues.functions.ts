import { EvaluationRepository } from "@domain/evaluations"
import { exportSelectionSchema } from "@domain/exports"
import {
  type ApplyIssueLifecycleCommandResult,
  applyIssueLifecycleCommandUseCase,
  buildHistogramBucketScaffold,
  DEFAULT_ESCALATION_SENSITIVITY_K,
  type DimensionPattern,
  deriveIssueLifecycleStates,
  embedIssueSearchQueryUseCase,
  fillBuckets,
  getEscalationOccurrenceThreshold,
  getRelatedIssuesUseCase,
  type Issue,
  issueAssigneeFilterSchema,
  type IssueListItem,
  IssueRepository,
  issueLifecycleCommandSchema,
  issuePrioritySchema,
  issuesLifecycleGroupSchema,
  issuesSortDirectionSchema,
  issuesSortFieldSchema,
  type ListIssuesResult,
  listIssuesUseCase,
  listIssueTracesUseCase,
  type OrgIssueSearchItem,
  rankDimensionValues,
  searchOrgIssuesUseCase,
  TAG_AGGREGATION_FALLBACK_DAYS,
  updateIssueTriageUseCase,
} from "@domain/issues"
import {
  type IssueDimension,
  type IssueEscalationThresholdBucket,
  ScoreAnalyticsRepository,
  ScoreRepository,
} from "@domain/scores"
import { IssueId, OrganizationId, ProjectId, resolveSettings, SettingsReader } from "@domain/shared"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import { ScoreAnalyticsRepositoryLive, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  EvaluationRepositoryLive,
  IssueRepositoryLive,
  MembershipRepositoryLive,
  OutboxEventWriterLive,
  ScoreRepositoryLive,
  SettingsReaderLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { enforceExportRequestRateLimit } from "../../domains/exports/export-rate-limit.ts"
import { ensureSession } from "../../domains/sessions/session.functions.ts"
import { getSessionOrganizationId, requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient, getQueuePublisher, getRedisClient } from "../../server/clients.ts"
import {
  type EvaluationSummaryRecord,
  toEvaluationSummaryRecord,
} from "../evaluations/evaluation-alignment.functions.ts"
import { type TraceRecord, toTraceRecord } from "../traces/traces.functions.ts"

const listIssuesInputSchema = z.object({
  projectId: z.string(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  lifecycleGroup: issuesLifecycleGroupSchema.optional(),
  assigneeIds: z.array(issueAssigneeFilterSchema).min(1).optional(),
  sort: z
    .object({
      field: issuesSortFieldSchema,
      direction: issuesSortDirectionSchema,
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

const toIssuesBucketRecord = (bucket: { readonly bucket: string; readonly count: number }) => ({
  bucket: bucket.bucket,
  count: bucket.count,
})

const toIssueRecord = (issue: IssueListItem) => ({
  id: issue.id,
  projectId: issue.projectId,
  name: issue.name,
  description: issue.description,
  source: issue.source,
  states: issue.states,
  assigneeId: issue.assigneeId,
  priority: issue.priority,
  createdAt: issue.createdAt.toISOString(),
  updatedAt: issue.updatedAt.toISOString(),
  escalatedAt: issue.escalatedAt?.toISOString() ?? null,
  resolvedAt: issue.resolvedAt?.toISOString() ?? null,
  ignoredAt: issue.ignoredAt?.toISOString() ?? null,
  firstSeenAt: issue.firstSeenAt.toISOString(),
  lastSeenAt: issue.lastSeenAt.toISOString(),
  occurrences: issue.occurrences,
  similarityScore: issue.similarityScore,
  affectedTracesPercent: issue.affectedTracesPercent,
  escalationOccurrenceThreshold: issue.escalationOccurrenceThreshold,
  trend: issue.trend.map(toIssuesBucketRecord),
  evaluations: issue.evaluations.map(toEvaluationSummaryRecord),
  tags: issue.tags,
})

export type IssueRecord = ReturnType<typeof toIssueRecord>

const toIssuesListResultRecord = (result: ListIssuesResult, viewerUserId: string) => ({
  analytics: {
    counts: result.analytics.counts,
    histogram: result.analytics.histogram.map(toIssuesBucketRecord),
    histogramBucketSeconds: result.analytics.histogramBucketSeconds,
    totalTraces: result.analytics.totalTraces,
  },
  items: result.items.map(toIssueRecord),
  totalCount: result.totalCount,
  hasMore: result.hasMore,
  hasAnyIssues: result.hasAnyIssues,
  limit: result.limit,
  offset: result.offset,
  occurrencesSum: result.occurrencesSum,
  priorityCounts: result.priorityCounts,
  // Resolved server-side from the per-assignee counts so the client never
  // receives the full assignee map; reflects every filter except the assignee
  // filter itself (see ListIssuesResult.assigneeCounts).
  myIssuesCount: result.assigneeCounts[viewerUserId] ?? 0,
})

export type IssuesListResultRecord = ReturnType<typeof toIssuesListResultRecord>

const issueInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
})

const toIssueSummaryRecord = (issue: Issue) => ({
  id: issue.id,
  projectId: issue.projectId,
  name: issue.name,
  description: issue.description,
  source: issue.source,
  createdAt: issue.createdAt.toISOString(),
  updatedAt: issue.updatedAt.toISOString(),
  escalatedAt: issue.escalatedAt?.toISOString() ?? null,
  resolvedAt: issue.resolvedAt?.toISOString() ?? null,
  ignoredAt: issue.ignoredAt?.toISOString() ?? null,
})

export type IssueSummaryRecord = ReturnType<typeof toIssueSummaryRecord>

const issueDetailInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
})

const issueTracesInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})

const issueTracesCountInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
})

const issueImpactInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
})

const updateIssueTriageInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
  // `undefined` (key omitted) leaves the field unchanged; `null` clears it; a value sets it.
  assigneeId: z.string().nullable().optional(),
  priority: issuePrioritySchema.nullable().optional(),
})

const issueDimensionSchema = z.enum([
  "model",
  "provider",
  "tool",
  "tag",
  "finishReason",
]) satisfies z.ZodType<IssueDimension>

const issueDimensionsInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
  dimension: issueDimensionSchema,
})

const issueOccurrencesInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
})

const relatedIssuesInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
})

// Cap on how many pinpointed example occurrences the carousel loads. Examples
// are for eyeballing a few representative failures, not exhaustive browsing
// (the Traces section covers full enumeration).
const ISSUE_EXAMPLES_LIMIT = 30

const toUtcDayEnd = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999))

const ISSUE_DETAIL_TREND_BUCKET_SECONDS = 12 * 60 * 60 // 12h

const toIssueDetailRecord = (input: {
  readonly issue: Issue
  readonly states: readonly string[]
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
  readonly totalOccurrences: number
  readonly escalationOccurrenceThreshold: number | null
  readonly trend: readonly { readonly bucket: string; readonly count: number }[]
  readonly trendBucketSeconds: number
  readonly trendEscalationThresholds: readonly IssueEscalationThresholdBucket[]
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
  source: input.issue.source,
  assigneeId: input.issue.assigneeId,
  priority: input.issue.priority,
  states: input.states,
  createdAt: input.issue.createdAt.toISOString(),
  updatedAt: input.issue.updatedAt.toISOString(),
  escalatedAt: input.issue.escalatedAt?.toISOString() ?? null,
  resolvedAt: input.issue.resolvedAt?.toISOString() ?? null,
  ignoredAt: input.issue.ignoredAt?.toISOString() ?? null,
  firstSeenAt: input.firstSeenAt.toISOString(),
  lastSeenAt: input.lastSeenAt.toISOString(),
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

export type IssueDetailRecord = ReturnType<typeof toIssueDetailRecord>

const toIssueTraceRecord = (trace: TraceDetail): TraceRecord => toTraceRecord(trace)

export type IssueTraceRecord = TraceRecord

const issueLifecycleActionInputSchema = z.object({
  projectId: z.string(),
  issueId: z.string(),
  command: issueLifecycleCommandSchema,
  keepMonitoring: z.boolean().optional(),
})

const toIssueLifecycleCommandRecord = (result: ApplyIssueLifecycleCommandResult) => ({
  command: result.command,
  keepMonitoring: result.keepMonitoring,
  items: result.items.map((item) => ({
    issueId: item.issueId,
    resolvedAt: item.resolvedAt?.toISOString() ?? null,
    ignoredAt: item.ignoredAt?.toISOString() ?? null,
    updatedAt: item.updatedAt.toISOString(),
    changed: item.changed,
  })),
})

type IssueLifecycleCommandRecord = ReturnType<typeof toIssueLifecycleCommandRecord>

export const listIssues = createServerFn({ method: "GET" })
  .inputValidator(listIssuesInputSchema)
  .handler(async ({ data }): Promise<IssuesListResultRecord> => {
    const { organizationId, userId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const pgClient = getPostgresClient()
    const chClient = getClickhouseClient()
    const redisClient = getRedisClient()
    const trimmedSearchQuery = data.searchQuery?.trim() || undefined

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        // Direct-match lookup: if the user typed an exact issue id or slug, narrow the listing
        // to that issue and skip the (expensive) semantic-search embed call entirely. When
        // neither matches, fall through to the semantic search path. The id lookup is org-
        // scoped via RLS but not project-scoped — guard against cross-project leakage by
        // comparing the returned `projectId` to the request's project before accepting it.
        const directMatch = trimmedSearchQuery
          ? yield* Effect.gen(function* () {
              const issueRepo = yield* IssueRepository
              const [byId, bySlug] = yield* Effect.all(
                [
                  issueRepo
                    .findById(IssueId(trimmedSearchQuery))
                    .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null))),
                  issueRepo
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
          trimmedSearchQuery && !directMatch
            ? yield* embedIssueSearchQueryUseCase({
                organizationId,
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

        return yield* listIssuesUseCase({
          organizationId,
          projectId: data.projectId,
          ...(data.limit !== undefined ? { limit: data.limit } : {}),
          ...(data.offset !== undefined ? { offset: data.offset } : {}),
          ...(data.lifecycleGroup ? { lifecycleGroup: data.lifecycleGroup } : {}),
          ...(data.assigneeIds?.length ? { assigneeIds: data.assigneeIds } : {}),
          ...(data.sort ? { sort: data.sort } : {}),
          ...(timeRange ? { timeRange } : {}),
          ...(directMatch
            ? { issueIds: [directMatch.id] }
            : search
              ? {
                  search: {
                    query: search.query,
                    normalizedEmbedding: search.normalizedEmbedding,
                  },
                }
              : {}),
        })
      }).pipe(
        withPostgres(Layer.mergeAll(IssueRepositoryLive, EvaluationRepositoryLive), pgClient, orgId),
        withClickHouse(Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive), chClient, orgId),
        withAi(AIEmbedLive, redisClient),
        withTracing,
      ),
    )

    return toIssuesListResultRecord(result, userId)
  })

export interface OrgIssueSearchRecord {
  readonly id: string
  readonly projectId: string
  readonly projectSlug: string
  readonly projectName: string
  readonly slug: string
  readonly name: string
  readonly states: readonly string[]
}

const toOrgIssueSearchRecord = (item: OrgIssueSearchItem): OrgIssueSearchRecord => ({
  id: item.id,
  projectId: item.projectId,
  projectSlug: item.projectSlug,
  projectName: item.projectName,
  slug: item.slug,
  name: item.name,
  states: item.states,
})

/**
 * Org-wide issue search for the Command Palette. Unlike {@link listIssues} (a project-scoped
 * analytics pipeline), this is a lightweight search across every project in the caller's
 * organization. The lexical tier runs always; the semantic tier runs only when `semantic` is set
 * (the debounced call), embedding the query first. Each result carries its owning project's
 * slug/name and derived lifecycle states. Resolved/ignored issues are excluded.
 */
export const searchOrgIssues = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      searchQuery: z.string().min(1).max(500),
      semantic: z.boolean().optional(),
      preferProjectId: z.string().optional(),
      limit: z.number().int().min(1).max(25).optional(),
    }),
  )
  .handler(async ({ data }): Promise<readonly OrgIssueSearchRecord[]> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const pgClient = getPostgresClient()
    const redisClient = getRedisClient()

    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const search = data.semantic
          ? yield* embedIssueSearchQueryUseCase({
              organizationId,
              // Org-wide search has no single project; `projectId` is telemetry-only on this
              // use-case (it does not scope the embedding), so we tag it with the org id.
              projectId: organizationId,
              query: data.searchQuery,
            })
          : undefined

        return yield* searchOrgIssuesUseCase({
          organizationId: orgId,
          query: data.searchQuery,
          ...(search ? { normalizedEmbedding: search.normalizedEmbedding } : {}),
          ...(data.preferProjectId !== undefined ? { preferProjectId: ProjectId(data.preferProjectId) } : {}),
          ...(data.limit !== undefined ? { limit: data.limit } : {}),
        })
      }).pipe(withPostgres(IssueRepositoryLive, pgClient, orgId), withAi(AIEmbedLive, redisClient), withTracing),
    )

    return results.map(toOrgIssueSearchRecord)
  })

export const getIssue = createServerFn({ method: "GET" })
  .inputValidator(issueInputSchema)
  .handler(async ({ data }): Promise<IssueSummaryRecord | null> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const pgClient = getPostgresClient()
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository
        const issues = yield* issueRepository.findByIds({
          projectId,
          issueIds: [issueId],
        })
        const issue = issues[0]

        return issue ? toIssueSummaryRecord(issue) : null
      }).pipe(withPostgres(IssueRepositoryLive, pgClient, orgId), withTracing),
    )
  })

export interface IssueLifecycleSummaryRecord {
  readonly id: string
  readonly name: string
  readonly states: readonly string[]
}

/**
 * Tiny "name + current status" lookup used by the in-app notifications card
 * to refresh the snapshot the bell stored at notification-creation time.
 * Cheap on purpose — no occurrences/trend/evaluations like getIssueDetail.
 */
export const getIssueLifecycleSummary = createServerFn({ method: "GET" })
  .inputValidator(issueInputSchema)
  .handler(async ({ data }): Promise<IssueLifecycleSummaryRecord | null> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const pgClient = getPostgresClient()
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)
    const now = new Date()

    return Effect.runPromise(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository
        const issues = yield* issueRepository.findByIds({ projectId, issueIds: [issueId] })
        const issue = issues[0]
        if (!issue) return null

        const states = deriveIssueLifecycleStates({
          issue,
          isEscalating: issue.lifecycle.isEscalating,
          isRegressed: issue.lifecycle.isRegressed,
          now,
        })
        return { id: issue.id, name: issue.name, states: [...states] }
      }).pipe(withPostgres(IssueRepositoryLive, pgClient, orgId), withTracing),
    )
  })

export const getIssueDetail = createServerFn({ method: "GET" })
  .inputValidator(issueDetailInputSchema)
  .handler(async ({ data }): Promise<IssueDetailRecord | null> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const pgClient = getPostgresClient()
    const chClient = getClickhouseClient()
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)
    const now = new Date()

    return Effect.runPromise(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository
        const evaluationRepository = yield* EvaluationRepository
        const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
        const scoreRepository = yield* ScoreRepository
        const settingsReader = yield* SettingsReader

        const issues = yield* issueRepository.findByIds({
          projectId,
          issueIds: [issueId],
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
          bucketSeconds: ISSUE_DETAIL_TREND_BUCKET_SECONDS,
        })

        // Match the listIssuesUseCase tag-aggregation window so the drawer
        // and the table show a consistent set of tags for the same issue.
        const tagsFrom = new Date(now)
        tagsFrom.setUTCDate(tagsFrom.getUTCDate() - TAG_AGGREGATION_FALLBACK_DAYS)

        // `escalation.sensitivity` is the user-facing `k_short` knob on the
        // seasonal detector — read raw here (not via `resolveSettings`) since
        // the cascade only surfaces `keepMonitoring` today.
        // TODO: Remove this after releasing monitors for everybody — the knob
        // moves onto the system "Issue escalating" monitor's alert condition.
        const projectSettings = yield* settingsReader.getProjectSettings(projectId)
        const kShort = projectSettings?.escalation?.sensitivity ?? DEFAULT_ESCALATION_SENSITIVITY_K

        // Only flagger-sourced issues need the slug query — annotation/custom issues
        // never carry a `metadata.flaggerSlug` so we skip the Postgres read entirely.
        const flaggerSlugsEffect =
          issue.source === "flagger"
            ? scoreRepository.listFlaggerSlugsByIssueId({ projectId, issueId: issue.id })
            : Effect.succeed<readonly string[]>([])

        const [occurrences, trend, thresholdSeries, evaluationPage, tagsAggregates, flaggerSlugs, settings] =
          yield* Effect.all([
            scoreAnalyticsRepository.aggregateByIssues({
              organizationId: orgId,
              projectId,
              issueIds: [issue.id],
            }),
            scoreAnalyticsRepository.trendByIssue({
              organizationId: orgId,
              projectId,
              issueId: issue.id,
              days: 14,
              bucketSeconds: ISSUE_DETAIL_TREND_BUCKET_SECONDS,
            }),
            scoreAnalyticsRepository.escalationThresholdHistogramByIssues({
              organizationId: orgId,
              projectId,
              issueIds: [issue.id],
              timeRange: { from: trendFrom, to: trendTo },
              bucketSeconds: ISSUE_DETAIL_TREND_BUCKET_SECONDS,
              kShort,
            }),
            evaluationRepository.listByIssueId({
              projectId,
              issueId: issue.id,
              options: {
                lifecycle: "active",
                limit: 1000,
              },
            }),
            scoreAnalyticsRepository.aggregateTagsByIssues({
              organizationId: orgId,
              projectId,
              issueIds: [issue.id],
              timeRange: { from: tagsFrom, to: now },
            }),
            flaggerSlugsEffect,
            resolveSettings({ projectId }),
          ])

        const occurrence = occurrences[0] ?? null
        const thresholdBuckets = thresholdSeries[0]?.buckets ?? []

        return toIssueDetailRecord({
          issue,
          states: deriveIssueLifecycleStates({
            issue,
            isEscalating: issue.lifecycle.isEscalating,
            isRegressed: issue.lifecycle.isRegressed,
            now,
          }),
          firstSeenAt: occurrence?.firstSeenAt ?? issue.createdAt,
          lastSeenAt: occurrence?.lastSeenAt ?? issue.createdAt,
          totalOccurrences: occurrence?.totalOccurrences ?? 0,
          escalationOccurrenceThreshold:
            occurrence !== null ? getEscalationOccurrenceThreshold(occurrence.baselineAvgOccurrences) : null,
          trend: fillBuckets({
            scaffold: trendScaffold,
            buckets: trend,
          }),
          trendBucketSeconds: ISSUE_DETAIL_TREND_BUCKET_SECONDS,
          trendEscalationThresholds: thresholdBuckets,
          evaluations: evaluationPage.items.map(toEvaluationSummaryRecord),
          tags: tagsAggregates[0]?.tags ?? [],
          flaggerSlugs,
          keepMonitoringDefault: settings.keepMonitoring,
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(IssueRepositoryLive, EvaluationRepositoryLive, ScoreRepositoryLive, SettingsReaderLive),
          pgClient,
          orgId,
        ),
        withClickHouse(ScoreAnalyticsRepositoryLive, chClient, orgId),
        withTracing,
      ),
    )
  })

const toIssueTracePageRecord = (input: {
  readonly items: readonly IssueTraceRecord[]
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}) => input

export type IssueTracePageRecord = ReturnType<typeof toIssueTracePageRecord>

export const listIssueTraces = createServerFn({ method: "GET" })
  .inputValidator(issueTracesInputSchema)
  .handler(async ({ data }): Promise<IssueTracePageRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const chClient = getClickhouseClient()
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)

    const result = await Effect.runPromise(
      listIssueTracesUseCase({
        organizationId: orgId,
        projectId,
        issueId,
        ...(data.limit !== undefined ? { limit: data.limit } : {}),
        ...(data.offset !== undefined ? { offset: data.offset } : {}),
      }).pipe(
        withClickHouse(Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive), chClient, orgId),
        withTracing,
      ),
    )

    return toIssueTracePageRecord({
      items: result.items.map(toIssueTraceRecord),
      hasMore: result.hasMore,
      limit: result.limit,
      offset: result.offset,
    })
  })

export const countIssueTraces = createServerFn({ method: "GET" })
  .inputValidator(issueTracesCountInputSchema)
  .handler(async ({ data }): Promise<{ readonly total: number }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const chClient = getClickhouseClient()
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
        const total = yield* scoreAnalyticsRepository.countTracesByIssue({
          organizationId: orgId,
          projectId,
          issueId,
        })
        return { total }
      }).pipe(withClickHouse(ScoreAnalyticsRepositoryLive, chClient, orgId), withTracing),
    )
  })

export interface IssueImpactRecord {
  readonly occurrences: number
  readonly affectedTraces: number
  readonly affectedSessions: number
  readonly affectedUsers: number
  readonly costMicrocents: number
  readonly tokens: number
  readonly totalProjectTraces: number
  /** Fraction of project traces affected by this issue, in `[0, 1]`. */
  readonly affectedTracesPercent: number
}

export const getIssueImpact = createServerFn({ method: "GET" })
  .inputValidator(issueImpactInputSchema)
  .handler(async ({ data }): Promise<IssueImpactRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const chClient = getClickhouseClient()
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
        const traceRepository = yield* TraceRepository

        const [impact, totalProjectTraces] = yield* Effect.all([
          scoreAnalyticsRepository.aggregateImpactByIssue({ organizationId: orgId, projectId, issueId }),
          traceRepository.countByProjectId({ organizationId: orgId, projectId }),
        ])

        const affectedTracesPercent =
          totalProjectTraces === 0 ? 0 : Math.min(impact.affectedTraces / totalProjectTraces, 1)

        return {
          occurrences: impact.occurrences,
          affectedTraces: impact.affectedTraces,
          affectedSessions: impact.affectedSessions,
          affectedUsers: impact.affectedUsers,
          costMicrocents: impact.costMicrocents,
          tokens: impact.tokens,
          totalProjectTraces,
          affectedTracesPercent,
        } satisfies IssueImpactRecord
      }).pipe(
        withClickHouse(Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive), chClient, orgId),
        withTracing,
      ),
    )
  })

export interface IssueDimensionsRecord {
  readonly dimension: IssueDimension
  /** Issue's unconditional trace incidence — the reference each pattern's `conditionalRate` is judged against. */
  readonly baseRate: number
  readonly issueAffectedTraces: number
  /** Support-gated, rate-elevation–ranked values (most over-represented first). */
  readonly patterns: readonly DimensionPattern[]
}

export const getIssueDimensions = createServerFn({ method: "GET" })
  .inputValidator(issueDimensionsInputSchema)
  .handler(async ({ data }): Promise<IssueDimensionsRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const chClient = getClickhouseClient()
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)

    const comparison = await Effect.runPromise(
      Effect.gen(function* () {
        const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
        return yield* scoreAnalyticsRepository.aggregateDimensionByIssue({
          organizationId: orgId,
          projectId,
          issueId,
          dimension: data.dimension,
        })
      }).pipe(withClickHouse(ScoreAnalyticsRepositoryLive, chClient, orgId), withTracing),
    )

    return {
      dimension: comparison.dimension,
      baseRate: comparison.baseRate,
      issueAffectedTraces: comparison.issueAffectedTraces,
      patterns: rankDimensionValues(comparison),
    }
  })

/** One Related-list row: why another issue relates to this one, plus identity to render/link it. */
export interface RelatedIssueRecord {
  readonly issueId: string
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

export const getRelatedIssues = createServerFn({ method: "GET" })
  .inputValidator(relatedIssuesInputSchema)
  .handler(async ({ data }): Promise<readonly RelatedIssueRecord[]> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const pgClient = getPostgresClient()
    const chClient = getClickhouseClient()

    const related = await Effect.runPromise(
      getRelatedIssuesUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        issueId: IssueId(data.issueId),
      }).pipe(
        withPostgres(IssueRepositoryLive, pgClient, orgId),
        withClickHouse(ScoreAnalyticsRepositoryLive, chClient, orgId),
        withTracing,
      ),
    )

    return related.map(
      (row): RelatedIssueRecord => ({
        issueId: row.issueId,
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
export interface IssueOccurrenceRecord {
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
export const getIssueOccurrences = createServerFn({ method: "GET" })
  .inputValidator(issueOccurrencesInputSchema)
  .handler(async ({ data }): Promise<{ readonly items: readonly IssueOccurrenceRecord[] }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const pgClient = getPostgresClient()
    const projectId = ProjectId(data.projectId)
    const issueId = IssueId(data.issueId)

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        const scoreRepository = yield* ScoreRepository
        return yield* scoreRepository.listByIssueId({
          projectId,
          issueId,
          source: "annotation",
          options: { limit: ISSUE_EXAMPLES_LIMIT, draftMode: "exclude" },
        })
      }).pipe(withPostgres(ScoreRepositoryLive, pgClient, orgId), withTracing),
    )

    const items = page.items.flatMap((score): IssueOccurrenceRecord[] => {
      // Only annotation scores carry message anchors; skip occurrences without a
      // trace to render or without a pinpointed message.
      if (score.source !== "annotation" || score.traceId === null || score.metadata.messageIndex === undefined) {
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

export interface UpdateIssueTriageRecord {
  readonly issueId: string
  readonly assigneeId: string | null
  readonly priority: z.infer<typeof issuePrioritySchema> | null
  readonly updatedAt: string
  readonly changed: boolean
}

export const updateIssueTriage = createServerFn({ method: "POST" })
  .inputValidator(updateIssueTriageInputSchema)
  .handler(async ({ data }): Promise<UpdateIssueTriageRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const pgClient = getPostgresClient()

    const result = await Effect.runPromise(
      updateIssueTriageUseCase({
        projectId: data.projectId,
        issueId: IssueId(data.issueId),
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
      }).pipe(
        withPostgres(Layer.mergeAll(IssueRepositoryLive, MembershipRepositoryLive), pgClient, orgId),
        withTracing,
      ),
    )

    return {
      issueId: result.issueId,
      assigneeId: result.assigneeId,
      priority: result.priority,
      updatedAt: result.updatedAt.toISOString(),
      changed: result.changed,
    }
  })

export const applyIssueLifecycleAction = createServerFn({ method: "POST" })
  .inputValidator(issueLifecycleActionInputSchema)
  .handler(async ({ data }): Promise<IssueLifecycleCommandRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const pgClient = getPostgresClient()

    const result = await Effect.runPromise(
      applyIssueLifecycleCommandUseCase({
        projectId: data.projectId,
        issueIds: [data.issueId],
        command: data.command,
        keepMonitoring: data.keepMonitoring,
      }).pipe(
        withPostgres(
          Layer.mergeAll(IssueRepositoryLive, EvaluationRepositoryLive, OutboxEventWriterLive, SettingsReaderLive),
          pgClient,
          orgId,
        ),
        withTracing,
      ),
    )

    return toIssueLifecycleCommandRecord(result)
  })

const bulkIssueLifecycleActionInputSchema = z.object({
  projectId: z.string(),
  selection: exportSelectionSchema,
  command: issueLifecycleCommandSchema,
  keepMonitoring: z.boolean().optional(),
  lifecycleGroup: issuesLifecycleGroupSchema.optional(),
  assigneeIds: z.array(issueAssigneeFilterSchema).min(1).optional(),
  sort: z
    .object({
      field: issuesSortFieldSchema,
      direction: issuesSortDirectionSchema,
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

export const applyBulkIssueLifecycleAction = createServerFn({ method: "POST" })
  .inputValidator(bulkIssueLifecycleActionInputSchema)
  .handler(async ({ data }): Promise<IssueLifecycleCommandRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const pgClient = getPostgresClient()
    const chClient = getClickhouseClient()
    const redisClient = getRedisClient()
    const trimmedSearchQuery = data.searchQuery?.trim() || undefined

    const issueIds: string[] = []

    if (data.selection.mode === "selected") {
      issueIds.push(...data.selection.rowIds)
    } else {
      const selectionIds = data.selection.mode === "allExcept" ? new Set(data.selection.rowIds) : null

      await Effect.runPromise(
        Effect.gen(function* () {
          const search = trimmedSearchQuery
            ? yield* embedIssueSearchQueryUseCase({
                organizationId,
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
            const page = yield* listIssuesUseCase({
              organizationId,
              projectId: data.projectId,
              limit: BULK_ACTION_BATCH_SIZE,
              offset,
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
              issueIds.push(issue.id)
            }

            if (!page.hasMore) break
            offset += page.limit
          }
        }).pipe(
          withPostgres(Layer.mergeAll(IssueRepositoryLive, EvaluationRepositoryLive), pgClient, orgId),
          withClickHouse(Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive), chClient, orgId),
          withAi(AIEmbedLive, redisClient),
          withTracing,
        ),
      )
    }

    if (issueIds.length === 0) {
      return {
        command: data.command,
        keepMonitoring: null,
        items: [],
      }
    }

    const result = await Effect.runPromise(
      applyIssueLifecycleCommandUseCase({
        projectId: data.projectId,
        issueIds,
        command: data.command,
        keepMonitoring: data.keepMonitoring,
      }).pipe(
        withPostgres(
          Layer.mergeAll(IssueRepositoryLive, EvaluationRepositoryLive, OutboxEventWriterLive, SettingsReaderLive),
          pgClient,
          orgId,
        ),
        withTracing,
      ),
    )

    return toIssueLifecycleCommandRecord(result)
  })

interface EnqueuedExportResult {
  readonly type: "enqueued"
}

export const enqueueIssuesExport = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      selection: exportSelectionSchema.optional(),
      lifecycleGroup: issuesLifecycleGroupSchema.optional(),
      assigneeIds: z.array(issueAssigneeFilterSchema).min(1).optional(),
      sort: z
        .object({
          field: issuesSortFieldSchema,
          direction: issuesSortDirectionSchema,
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
