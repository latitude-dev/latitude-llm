import { EvaluationRepository } from "@domain/evaluations"
import { exportSelectionSchema } from "@domain/exports"
import {
  type ApplyIssueLifecycleCommandResult,
  applyIssueLifecycleCommandUseCase,
  DEFAULT_ESCALATION_SENSITIVITY_K,
  deriveIssueLifecycleStates,
  embedIssueSearchQueryUseCase,
  getEscalationOccurrenceThreshold,
  type Issue,
  type IssueListItem,
  IssueRepository,
  issueLifecycleCommandSchema,
  issuesLifecycleGroupSchema,
  issuesSortDirectionSchema,
  issuesSortFieldSchema,
  type ListIssuesResult,
  listIssuesUseCase,
  listIssueTracesUseCase,
  type OrgIssueSearchItem,
  searchOrgIssuesUseCase,
  TAG_AGGREGATION_FALLBACK_DAYS,
} from "@domain/issues"
import {
  type IssueEscalationThresholdBucket,
  type IssueOccurrenceBucket,
  ScoreAnalyticsRepository,
  ScoreRepository,
} from "@domain/scores"
import { IssueId, OrganizationId, ProjectId, resolveSettings, SettingsReader } from "@domain/shared"
import type { TraceDetail } from "@domain/spans"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import { ScoreAnalyticsRepositoryLive, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  EvaluationRepositoryLive,
  IssueRepositoryLive,
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

const toIssuesListResultRecord = (result: ListIssuesResult) => ({
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

const toUtcDayEnd = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999))

/**
 * Sub-day-aware scaffold producing ISO-8601 UTC bucket-start timestamps. Used by the issue
 * detail trend (12h buckets) — the wider per-bucket precision lets incident overlays land in
 * the right half-day rather than collapsing to the calendar date.
 */
const buildHistogramBucketScaffold = (input: {
  readonly from: Date
  readonly to: Date
  readonly bucketSeconds: number
}): readonly string[] => {
  const widthMs = input.bucketSeconds * 1000
  if (widthMs <= 0) return []
  const startMs = Math.floor(input.from.getTime() / widthMs) * widthMs
  const endMs = input.to.getTime()
  const out: string[] = []
  for (let cursor = startMs; cursor <= endMs; cursor += widthMs) {
    out.push(new Date(cursor).toISOString())
  }
  return out
}

const ISSUE_DETAIL_TREND_BUCKET_SECONDS = 12 * 60 * 60 // 12h

const fillBuckets = (input: {
  readonly scaffold: readonly string[]
  readonly buckets: readonly IssueOccurrenceBucket[]
}): readonly { readonly bucket: string; readonly count: number }[] => {
  const countsByBucket = new Map(input.buckets.map((bucket) => [bucket.bucket, bucket.count] as const))
  return input.scaffold.map((bucket) => ({
    bucket,
    count: countsByBucket.get(bucket) ?? 0,
  }))
}

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
    const { organizationId } = await requireSession()
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

    return toIssuesListResultRecord(result)
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
 * slug/name and derived lifecycle states.
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
          Layer.mergeAll(IssueRepositoryLive, EvaluationRepositoryLive, SettingsReaderLive),
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
          Layer.mergeAll(IssueRepositoryLive, EvaluationRepositoryLive, SettingsReaderLive),
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
        ...(data.sort ? { sort: data.sort } : {}),
        ...(data.searchQuery ? { searchQuery: data.searchQuery } : {}),
        ...(exportTimeRange ? { timeRange: exportTimeRange } : {}),
      }),
    )

    return { type: "enqueued" }
  })
