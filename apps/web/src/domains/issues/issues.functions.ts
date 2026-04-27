import { EvaluationRepository } from "@domain/evaluations"
import { exportSelectionSchema } from "@domain/exports"
import {
  type ApplyIssueLifecycleCommandResult,
  applyIssueLifecycleCommandUseCase,
  deriveIssueLifecycleStates,
  embedIssueSearchQueryUseCase,
  getEscalationOccurrenceThreshold,
  type Issue,
  type IssueListItem,
  IssueProjectionRepository,
  IssueRepository,
  issueLifecycleCommandSchema,
  issuesLifecycleGroupSchema,
  issuesSortDirectionSchema,
  issuesSortFieldSchema,
  type ListIssuesResult,
  listIssuesUseCase,
} from "@domain/issues"
import { type IssueOccurrenceBucket, ScoreAnalyticsRepository } from "@domain/scores"
import { IssueId, OrganizationId, ProjectId, resolveSettings } from "@domain/shared"
import { type Trace, TraceRepository } from "@domain/spans"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import { ScoreAnalyticsRepositoryLive, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { EvaluationRepositoryLive, IssueRepositoryLive, SettingsReaderLive, withPostgres } from "@platform/db-postgres"
import { IssueProjectionRepositoryLive, withWeaviate } from "@platform/db-weaviate"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { enforceExportRequestRateLimit } from "../../domains/exports/export-rate-limit.ts"
import { ensureSession } from "../../domains/sessions/session.functions.ts"
import { getSessionOrganizationId, requireSession } from "../../server/auth.ts"
import {
  getClickhouseClient,
  getPostgresClient,
  getQueuePublisher,
  getRedisClient,
  getWeaviateClient,
} from "../../server/clients.ts"
import {
  type EvaluationSummaryRecord,
  toEvaluationSummaryRecord,
} from "../evaluations/evaluation-alignment.functions.ts"
import { type TraceRecord, toTraceRecord } from "../traces/traces.functions.ts"
import { buildIssuesTraceCountFilters, withIssuesTraceTotals } from "./issues-list-metrics.ts"

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
  uuid: issue.uuid,
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
    totalTraces: result.analytics.totalTraces,
  },
  items: result.items.map(toIssueRecord),
  totalCount: result.totalCount,
  hasMore: result.hasMore,
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
  uuid: issue.uuid,
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

const toUtcDayEnd = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999))

const buildBucketScaffold = (input: { readonly from: Date; readonly to: Date }): readonly string[] => {
  const buckets: string[] = []
  const cursor = new Date(input.from)
  cursor.setUTCHours(0, 0, 0, 0)

  while (cursor.getTime() <= input.to.getTime()) {
    buckets.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return buckets
}

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
  readonly evaluations: readonly EvaluationSummaryRecord[]
  readonly tags: readonly string[]
  readonly keepMonitoringDefault: boolean
}) => ({
  id: input.issue.id,
  uuid: input.issue.uuid,
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
  evaluations: input.evaluations,
  tags: input.tags,
  keepMonitoringDefault: input.keepMonitoringDefault,
})

export type IssueDetailRecord = ReturnType<typeof toIssueDetailRecord>

const toIssueTraceRecord = (trace: Trace): TraceRecord => toTraceRecord(trace)

export type IssueTraceRecord = TraceRecord

const withEmptyIssueProjection = Effect.provide(
  Layer.succeed(IssueProjectionRepository, {
    upsert: () => Effect.void,
    delete: () => Effect.void,
    hybridSearch: () => Effect.succeed([]),
  }),
)

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
    const projectId = ProjectId(data.projectId)
    const pgClient = getPostgresClient()
    const chClient = getClickhouseClient()
    const redisClient = getRedisClient()
    const trimmedSearchQuery = data.searchQuery?.trim() || undefined
    const traceCountFilters = buildIssuesTraceCountFilters(data.timeRange)
    const provideIssueProjection = trimmedSearchQuery
      ? withWeaviate(IssueProjectionRepositoryLive, await getWeaviateClient(), orgId)
      : withEmptyIssueProjection

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const traceRepository = yield* TraceRepository
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

        const [issues, totalTraces] = yield* Effect.all([
          listIssuesUseCase({
            organizationId,
            projectId: data.projectId,
            ...(data.limit !== undefined ? { limit: data.limit } : {}),
            ...(data.offset !== undefined ? { offset: data.offset } : {}),
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
          }),
          traceRepository.countByProjectId({
            organizationId: orgId,
            projectId,
            ...(traceCountFilters ? { filters: traceCountFilters } : {}),
          }),
        ])

        return withIssuesTraceTotals(issues, totalTraces)
      }).pipe(
        withPostgres(Layer.mergeAll(IssueRepositoryLive, EvaluationRepositoryLive), pgClient, orgId),
        withClickHouse(Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive), chClient, orgId),
        provideIssueProjection,
        withAi(AIEmbedLive, redisClient),
        withTracing,
      ),
    )

    return toIssuesListResultRecord(result)
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
        const trendScaffold = buildBucketScaffold({ from: trendFrom, to: trendTo })

        const [occurrences, trend, evaluationPage, tagsAggregates, settings] = yield* Effect.all([
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
          }),
          resolveSettings({ projectId }),
        ])

        const occurrence = occurrences[0] ?? null

        return toIssueDetailRecord({
          issue,
          states: deriveIssueLifecycleStates({
            issue,
            occurrence,
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
          evaluations: evaluationPage.items.map(toEvaluationSummaryRecord),
          tags: tagsAggregates[0]?.tags ?? [],
          keepMonitoringDefault: settings.keepMonitoring,
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(IssueRepositoryLive, EvaluationRepositoryLive, SettingsReaderLive),
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

    return Effect.runPromise(
      Effect.gen(function* () {
        const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
        const traceRepository = yield* TraceRepository

        const tracePage = yield* scoreAnalyticsRepository.listTracesByIssue({
          organizationId: orgId,
          projectId,
          issueId,
          ...(data.limit !== undefined ? { limit: data.limit } : {}),
          ...(data.offset !== undefined ? { offset: data.offset } : {}),
        })

        if (tracePage.items.length === 0) {
          return toIssueTracePageRecord({
            items: [],
            hasMore: false,
            limit: tracePage.limit,
            offset: tracePage.offset,
          })
        }

        const traces = yield* traceRepository.listSummariesByTraceIds({
          organizationId: orgId,
          projectId,
          traceIds: tracePage.items.map((item) => item.traceId),
        })
        const traceById = new Map(traces.map((trace) => [trace.traceId, trace] as const))

        return toIssueTracePageRecord({
          items: tracePage.items
            .map((item) => traceById.get(item.traceId))
            .filter((trace): trace is Trace => trace !== undefined)
            .map(toIssueTraceRecord),
          hasMore: tracePage.hasMore,
          limit: tracePage.limit,
          offset: tracePage.offset,
        })
      }).pipe(
        withClickHouse(Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive), chClient, orgId),
        withAi(AIEmbedLive, getRedisClient()),
        withTracing,
      ),
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
    const provideIssueProjection = trimmedSearchQuery
      ? withWeaviate(IssueProjectionRepositoryLive, await getWeaviateClient(), orgId)
      : withEmptyIssueProjection

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
          provideIssueProjection,
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
