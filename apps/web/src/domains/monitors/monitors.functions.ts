import { exportSelectionSchema } from "@domain/exports"
import { IncidentRepository, resolveIncidentUseCase } from "@domain/incidents"
import {
  createMonitorUseCase,
  deleteMonitorUseCase,
  evaluationTimeAxis,
  formatHumanReadableAlert,
  getMonitorBySlugUseCase,
  getMonitorIncidentsUseCase,
  type ListMonitorsResult,
  listMonitorsForTargetUseCase,
  listMonitorsUseCase,
  MetricSeriesReader,
  type MetricSeriesTarget,
  type Monitor,
  type MonitorLastIncident,
  MonitorRepository,
  type MonitorSearchResult,
  monitorStreamForTargetType,
  monitorTargetSchema,
  muteMonitorUseCase,
  searchMonitorsUseCase,
  unmuteMonitorUseCase,
  updateMonitorUseCase,
} from "@domain/monitors"
import { listSavedSearches, SavedSearchRepository } from "@domain/saved-searches"
import {
  AlertIncidentId,
  alertIncidentConditionSchema,
  alertSeveritySchema,
  DEFAULT_SEVERITY_FOR_INCIDENT_NOTIFICATION_KEY,
  filterSetSchema,
  MonitorId,
  monitorStreamSchema,
  ProjectId,
  SavedSearchId,
  SignalId,
} from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { MetricSeriesReaderLive } from "@platform/db-clickhouse"
import {
  IncidentRepositoryLive,
  MonitorRepositoryLive,
  NotificationRepositoryLive,
  OutboxEventWriterLive,
  SavedSearchRepositoryLive,
  SignalRepositoryLive,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { getClickhouseClient, getPostgresClient } from "../../server/clients.ts"
import type { ScopedOrgId } from "../../server/resolve-org-scope.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"
import { withScopedPostgres } from "../../server/scoped-postgres.ts"

interface SavedSearchRef {
  readonly name: string
  readonly slug: string
}

type MonitorRuleKind = "monitor.match" | "monitor.threshold" | "monitor.escalating"

export interface MonitorRuleRecord {
  readonly id: string
  readonly monitorId: string
  readonly kind: MonitorRuleKind
  readonly source: { readonly type: "savedSearch"; readonly id: string | null } | null
  readonly condition: Monitor["rule"]["config"]["condition"] | null
  readonly severity: Monitor["rule"]["severity"]
  readonly summary: string
  readonly sourceName: string | null
  readonly sourceSlug: string | null
  readonly createdAt: string
}

const monitorMetricForTarget = (monitor: Monitor) =>
  monitor.target.metric ?? monitor.rule.config.metric ?? { kind: "count" as const }

const normalizedMonitorTarget = (monitor: Monitor) => ({
  ...monitor.target,
  kind: monitor.target.kind ?? monitor.target.type,
  stream: monitorStreamForTargetType(monitor.target.type),
  filterSet: monitor.target.filterSet ?? null,
  query: monitor.target.query ?? null,
  savedSearchId: monitor.target.savedSearchId ?? (monitor.target.type === "savedSearch" ? monitor.target.id : null),
  metric: monitorMetricForTarget(monitor),
})

const toMonitorRuleRecord = (
  monitor: Monitor,
  savedSearchRefs: ReadonlyMap<string, SavedSearchRef>,
): MonitorRuleRecord => {
  const savedSearchId = monitor.target.type === "savedSearch" ? monitor.target.id : null
  const ref = savedSearchId ? savedSearchRefs.get(savedSearchId) : undefined
  const kind =
    monitor.rule.trigger === "match"
      ? "monitor.match"
      : monitor.rule.trigger === "threshold"
        ? "monitor.threshold"
        : "monitor.escalating"
  return {
    id: monitor.id,
    monitorId: monitor.id,
    kind,
    source: savedSearchId ? { type: "savedSearch" as const, id: savedSearchId } : null,
    condition: monitor.rule.config.condition ?? null,
    severity: monitor.rule.severity,
    summary: formatHumanReadableAlert(
      { kind, condition: monitor.rule.config.condition ?? null },
      ref ? { savedSearchName: ref.name } : undefined,
    ),
    sourceName: ref?.name ?? null,
    sourceSlug: ref?.slug ?? null,
    createdAt: monitor.createdAt.toISOString(),
  }
}

const userAlertKindSchema = z.enum([
  "savedSearch.match",
  "savedSearch.threshold",
  "savedSearch.escalating",
  "monitor.match",
  "monitor.threshold",
  "monitor.escalating",
])

type UserAlertKind = z.infer<typeof userAlertKindSchema>

const notificationKeyForAlertKind = (kind: UserAlertKind) =>
  kind.includes("threshold")
    ? "monitor.threshold"
    : kind.includes("escalating")
      ? "monitor.escalating"
      : "monitor.match"

const toMonitorRecord = (monitor: Monitor, savedSearchRefs: ReadonlyMap<string, SavedSearchRef>) => {
  const rule = toMonitorRuleRecord(monitor, savedSearchRefs)
  return {
    id: monitor.id,
    organizationId: monitor.organizationId,
    projectId: monitor.projectId,
    slug: monitor.slug,
    name: monitor.name,
    description: monitor.description,
    system: monitor.system,
    rule,
    target: normalizedMonitorTarget(monitor),
    targetSavedSearchName:
      monitor.target.type === "savedSearch" && monitor.target.id
        ? (savedSearchRefs.get(monitor.target.id)?.name ?? null)
        : null,
    targetSavedSearchSlug:
      monitor.target.type === "savedSearch" && monitor.target.id
        ? (savedSearchRefs.get(monitor.target.id)?.slug ?? null)
        : null,
    mutedAt: monitor.mutedAt?.toISOString() ?? null,
    deletedAt: monitor.deletedAt?.toISOString() ?? null,
    createdAt: monitor.createdAt.toISOString(),
    updatedAt: monitor.updatedAt.toISOString(),
  }
}

export type MonitorRecord = ReturnType<typeof toMonitorRecord>

const resolveSavedSearchRefs = async (
  orgId: ScopedOrgId,
  projectId: ProjectId,
  monitors: readonly Monitor[],
): Promise<ReadonlyMap<string, SavedSearchRef>> => {
  const referencesSavedSearch = monitors.some((monitor) => monitor.target.type === "savedSearch" && monitor.target.id)
  if (!referencesSavedSearch) return new Map()
  const page = await Effect.runPromise(
    listSavedSearches({ projectId }).pipe(
      withScopedPostgres(SavedSearchRepositoryLive, getPostgresClient(), orgId),
      withTracing,
    ),
  )
  return new Map(page.items.map((search) => [search.id, { name: search.name, slug: search.slug }]))
}

/** Resolve saved-search refs for a single monitor, then map it to its wire record. */
const toMonitorRecordResolved = async (orgId: ScopedOrgId, monitor: Monitor): Promise<MonitorRecord> => {
  const refs = await resolveSavedSearchRefs(orgId, monitor.projectId, [monitor])
  return toMonitorRecord(monitor, refs)
}

export interface MonitorLastIncidentRecord {
  readonly id: string
  readonly startedAtIso: string
  readonly endedAtIso: string | null
}

export interface MonitorListRowRecord {
  readonly monitor: MonitorRecord
  readonly lastIncident: MonitorLastIncidentRecord | null
}

const toMonitorListRowRecord = (
  monitor: Monitor,
  savedSearchRefs: ReadonlyMap<string, SavedSearchRef>,
  last: MonitorLastIncident | undefined,
): MonitorListRowRecord => ({
  monitor: toMonitorRecord(monitor, savedSearchRefs),
  lastIncident: last
    ? { id: last.id, startedAtIso: last.startedAt.toISOString(), endedAtIso: last.endedAt?.toISOString() ?? null }
    : null,
})

const toListMonitorsResultRecord = (
  result: ListMonitorsResult,
  savedSearchRefs: ReadonlyMap<string, SavedSearchRef>,
) => ({
  items: result.items.map((monitor) =>
    toMonitorListRowRecord(monitor, savedSearchRefs, result.lastIncidentByMonitorId.get(monitor.id)),
  ),
  totalCount: result.totalCount,
  hasMore: result.hasMore,
  limit: result.limit,
  offset: result.offset,
})

type ListMonitorsResultRecord = ReturnType<typeof toListMonitorsResultRecord>

const listMonitorsInputSchema = z.object({
  projectId: z.string(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  searchQuery: z.string().max(500).optional(),
  system: z.boolean().optional(),
})

export const listMonitors = createServerFn({ method: "GET" })
  .inputValidator(listMonitorsInputSchema)
  .handler(async ({ data, context }): Promise<ListMonitorsResultRecord> => {
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()

    const result = await Effect.runPromise(
      listMonitorsUseCase({
        projectId: ProjectId(data.projectId),
        ...(data.limit !== undefined ? { limit: data.limit } : {}),
        ...(data.offset !== undefined ? { offset: data.offset } : {}),
        ...(data.searchQuery ? { searchQuery: data.searchQuery } : {}),
        ...(data.system !== undefined ? { system: data.system } : {}),
      }).pipe(withScopedPostgres(MonitorRepositoryLive, pgClient, orgId), withTracing),
    )

    const refs = await resolveSavedSearchRefs(orgId, ProjectId(data.projectId), result.items)
    return toListMonitorsResultRecord(result, refs)
  })

const listMonitorsForTargetInputSchema = z.object({
  projectId: z.string(),
  stream: monitorStreamSchema,
  targetKind: monitorTargetSchema.shape.type.optional(),
  filterSetContains: filterSetSchema,
})

/** Live unified monitors targeting a specific tool/user — backs the in-context "monitors for this X" card. */
export const listMonitorsForTarget = createServerFn({ method: "GET" })
  .inputValidator(listMonitorsForTargetInputSchema)
  .handler(async ({ data, context }): Promise<MonitorRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const monitors = await Effect.runPromise(
      listMonitorsForTargetUseCase({
        projectId: ProjectId(data.projectId),
        ...(data.targetKind !== undefined ? { targetType: data.targetKind } : {}),
        filterSetContains: data.filterSetContains,
      }).pipe(
        withScopedPostgres(
          Layer.mergeAll(
            MonitorRepositoryLive,
            SavedSearchRepositoryLive,
            IncidentRepositoryLive,
            OutboxEventWriterLive,
          ),
          getPostgresClient(),
          orgId,
        ),
        withTracing,
      ),
    )
    const refs = await resolveSavedSearchRefs(orgId, ProjectId(data.projectId), monitors)
    return monitors.map((monitor) => toMonitorRecord(monitor, refs))
  })

const getMonitorMetricSeriesInputSchema = z.object({
  projectId: z.string(),
  monitorSlug: z.string(),
  fromMs: z.number(),
  toMs: z.number(),
  bucketMs: z.number().positive(),
})

interface MonitorMetricSeriesRecord {
  /** Bucket start timestamps (ms epoch), oldest-first. */
  readonly bucketStartsMs: number[]
  /** Metric value per bucket, oldest-first, aligned to `bucketStartsMs`. */
  readonly values: number[]
  readonly bucketMs: number
}

/** Resolve a monitor's persisted target to the metric reader's `(stream, filterSet, query, metric, timeAxis)`, on the axis the monitor fires on. */
const resolveMetricTarget = (monitor: Monitor) =>
  Effect.gen(function* () {
    const target = normalizedMonitorTarget(monitor)
    if (target.kind === "savedSearch" && target.savedSearchId !== null) {
      const search = yield* (yield* SavedSearchRepository)
        .findById(SavedSearchId(target.savedSearchId))
        .pipe(Effect.catchTag("SavedSearchNotFoundError", () => Effect.succeed(null)))
      if (search === null) return null
      return {
        stream: target.stream,
        filterSet: search.filterSet,
        query: search.query,
        metric: target.metric,
        timeAxis: evaluationTimeAxis(monitor.rule.trigger, target.metric),
      } satisfies MetricSeriesTarget
    }
    return {
      stream: target.stream,
      filterSet: target.filterSet ?? {},
      query: target.query ?? null,
      metric: target.metric,
      timeAxis: evaluationTimeAxis(monitor.rule.trigger, target.metric),
    } satisfies MetricSeriesTarget
  })

/** The monitor's tracked metric as a per-bucket series over `[fromMs, toMs)` — powers the monitor page histogram. */
export const getMonitorMetricSeries = createServerFn({ method: "GET" })
  .inputValidator(getMonitorMetricSeriesInputSchema)
  .handler(async ({ data, context }): Promise<MonitorMetricSeriesRecord | null> => {
    const orgId = await resolveOrgScope(context)
    const projectId = ProjectId(data.projectId)
    const bucketMs = data.bucketMs
    const to = new Date(data.toMs)
    const from = new Date(data.fromMs)

    return Effect.runPromise(
      Effect.gen(function* () {
        const monitor = yield* getMonitorBySlugUseCase({ projectId, slug: data.monitorSlug }).pipe(
          Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
        )
        if (monitor === null) return null
        const target = yield* resolveMetricTarget(monitor)
        if (target === null) return null
        const reader = yield* MetricSeriesReader
        const newestFirst = yield* reader.seriesPerBucket({
          organizationId: orgId,
          projectId,
          target,
          from,
          to,
          bucketMs,
        })
        const count = newestFirst.length
        // Reader returns newest-first aligned to `to`; flip to oldest-first with each bucket's start.
        const values = [...newestFirst].reverse()
        const bucketStartsMs = values.map((_, index) => data.toMs - (count - index) * bucketMs)
        return { bucketStartsMs, values, bucketMs } satisfies MonitorMetricSeriesRecord
      }).pipe(
        withScopedPostgres(
          Layer.mergeAll(
            MonitorRepositoryLive,
            SavedSearchRepositoryLive,
            IncidentRepositoryLive,
            OutboxEventWriterLive,
          ),
          getPostgresClient(),
          orgId,
        ),
        withScopedClickHouse(MetricSeriesReaderLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

export interface MonitorSearchRecord {
  readonly id: string
  readonly projectId: string
  readonly projectSlug: string
  readonly projectName: string
  readonly slug: string
  readonly name: string
  readonly system: boolean
  readonly mutedAt: string | null
}

const toMonitorSearchRecord = (m: MonitorSearchResult): MonitorSearchRecord => ({
  id: m.id,
  projectId: m.projectId,
  projectSlug: m.projectSlug,
  projectName: m.projectName,
  slug: m.slug,
  name: m.name,
  system: m.system,
  mutedAt: m.mutedAt?.toISOString() ?? null,
})

/**
 * Org-wide monitor search for the Command Palette. Unlike {@link listMonitors}, this returns
 * matching monitors across every project in the caller's organization, each tagged with its
 * owning project's slug/name.
 */
export const searchMonitorsOrgWide = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      searchQuery: z.string().max(500).optional(),
      preferProjectId: z.string().optional(),
      limit: z.number().int().min(1).max(25).optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<readonly MonitorSearchRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()

    const results = await Effect.runPromise(
      searchMonitorsUseCase({
        ...(data.searchQuery !== undefined ? { searchQuery: data.searchQuery } : {}),
        ...(data.preferProjectId !== undefined ? { preferProjectId: ProjectId(data.preferProjectId) } : {}),
        ...(data.limit !== undefined ? { limit: data.limit } : {}),
      }).pipe(withScopedPostgres(MonitorRepositoryLive, pgClient, orgId), withTracing),
    )

    return results.map(toMonitorSearchRecord)
  })

const getMonitorInputSchema = z.object({
  projectId: z.string(),
  slug: z.string().min(1).max(128),
})

export const getMonitorBySlug = createServerFn({ method: "GET" })
  .inputValidator(getMonitorInputSchema)
  .handler(async ({ data, context }): Promise<MonitorRecord | null> => {
    const orgId = await resolveOrgScope(context)
    const pgClient = getPostgresClient()

    const monitor = await Effect.runPromise(
      getMonitorBySlugUseCase({ projectId: ProjectId(data.projectId), slug: data.slug }).pipe(
        Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
        withScopedPostgres(MonitorRepositoryLive, pgClient, orgId),
        withTracing,
      ),
    )

    return monitor ? toMonitorRecordResolved(orgId, monitor) : null
  })

const monitorMutationInputSchema = z.object({ monitorId: z.string() })

const runMonitorMute = async (
  monitorId: string,
  muted: boolean,
  context: Parameters<typeof resolveOrgScope>[0],
): Promise<MonitorRecord> => {
  const orgId = await resolveOrgScope(context)
  const useCase = muted ? muteMonitorUseCase : unmuteMonitorUseCase

  const monitor = await Effect.runPromise(
    useCase({ id: MonitorId(monitorId) }).pipe(
      withScopedPostgres(MonitorRepositoryLive, getPostgresClient(), orgId),
      withTracing,
    ),
  )
  return toMonitorRecordResolved(orgId, monitor)
}

export const muteMonitor = createServerFn({ method: "POST" })
  .inputValidator(monitorMutationInputSchema)
  .handler(({ data, context }): Promise<MonitorRecord> => runMonitorMute(data.monitorId, true, context))

export const unmuteMonitor = createServerFn({ method: "POST" })
  .inputValidator(monitorMutationInputSchema)
  .handler(({ data, context }): Promise<MonitorRecord> => runMonitorMute(data.monitorId, false, context))

const bulkMonitorsInputSchema = z.object({
  projectId: z.string(),
  selection: exportSelectionSchema,
  // Filters mirroring the dashboard list query, so `all` / `allExcept`
  // selections act on exactly the rows the table shows.
  searchQuery: z.string().max(500).optional(),
  system: z.boolean().optional(),
})

type BulkMonitorsInput = z.infer<typeof bulkMonitorsInputSchema>

const BULK_MONITORS_BATCH_SIZE = 100

const resolveBulkSelectionMonitorIds = async (
  orgId: ScopedOrgId,
  data: BulkMonitorsInput,
): Promise<readonly string[]> => {
  if (data.selection.mode === "selected") return data.selection.rowIds

  const excluded = data.selection.mode === "allExcept" ? new Set(data.selection.rowIds) : null
  const trimmedSearchQuery = data.searchQuery?.trim() || undefined
  const ids: string[] = []

  await Effect.runPromise(
    Effect.gen(function* () {
      let offset = 0
      while (true) {
        const page = yield* listMonitorsUseCase({
          projectId: ProjectId(data.projectId),
          limit: BULK_MONITORS_BATCH_SIZE,
          offset,
          ...(trimmedSearchQuery ? { searchQuery: trimmedSearchQuery } : {}),
          ...(data.system !== undefined ? { system: data.system } : {}),
        })
        if (page.items.length === 0) break
        for (const monitor of page.items) {
          if (excluded?.has(monitor.id)) continue
          ids.push(monitor.id)
        }
        if (!page.hasMore) break
        offset += page.limit
      }
    }).pipe(withScopedPostgres(MonitorRepositoryLive, getPostgresClient(), orgId), withTracing),
  )

  return ids
}

export const bulkMuteMonitors = createServerFn({ method: "POST" })
  .inputValidator(bulkMonitorsInputSchema)
  .handler(async ({ data, context }): Promise<{ readonly mutedCount: number }> => {
    const orgId = await resolveOrgScope(context)
    const monitorIds = await resolveBulkSelectionMonitorIds(orgId, data)

    const mutedCount = await Effect.runPromise(
      Effect.gen(function* () {
        let count = 0
        for (const monitorId of monitorIds) {
          yield* muteMonitorUseCase({ id: MonitorId(monitorId) }).pipe(
            Effect.catchTag("NotFoundError", () => Effect.void),
          )
          count += 1
        }
        return count
      }).pipe(
        withScopedPostgres(
          Layer.mergeAll(
            MonitorRepositoryLive,
            SavedSearchRepositoryLive,
            IncidentRepositoryLive,
            OutboxEventWriterLive,
          ),
          getPostgresClient(),
          orgId,
        ),
        withTracing,
      ),
    )

    return { mutedCount }
  })

export const bulkDeleteMonitors = createServerFn({ method: "POST" })
  .inputValidator(bulkMonitorsInputSchema)
  .handler(
    async ({ data, context }): Promise<{ readonly deletedCount: number; readonly skippedSystemCount: number }> => {
      const orgId = await resolveOrgScope(context)
      const monitorIds = await resolveBulkSelectionMonitorIds(orgId, data)

      const counts = await Effect.runPromise(
        Effect.gen(function* () {
          let deletedCount = 0
          let skippedSystemCount = 0
          for (const monitorId of monitorIds) {
            const outcome = yield* deleteMonitorUseCase({ id: MonitorId(monitorId) }).pipe(
              Effect.as("deleted" as const),
              Effect.catchTags({
                SystemMonitorForbiddenError: () => Effect.succeed("skipped" as const),
                NotFoundError: () => Effect.succeed("missing" as const),
              }),
            )
            if (outcome === "deleted") deletedCount += 1
            if (outcome === "skipped") skippedSystemCount += 1
          }
          return { deletedCount, skippedSystemCount }
        }).pipe(
          withScopedPostgres(
            Layer.mergeAll(
              MonitorRepositoryLive,
              SavedSearchRepositoryLive,
              IncidentRepositoryLive,
              OutboxEventWriterLive,
            ),
            getPostgresClient(),
            orgId,
          ),
          withTracing,
        ),
      )

      return counts
    },
  )

export const bulkResolveMonitorLastIncidents = createServerFn({ method: "POST" })
  .inputValidator(bulkMonitorsInputSchema)
  .handler(async ({ data, context }): Promise<{ readonly resolvedCount: number }> => {
    const orgId = await resolveOrgScope(context)
    const monitorIds = await resolveBulkSelectionMonitorIds(orgId, data)

    const resolvedCount = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* IncidentRepository
        let count = 0
        for (const monitorId of monitorIds) {
          // Same ongoing-first pick the dashboard's "Last incident" column shows.
          const page = yield* repository.listByMonitorId({ monitorId: MonitorId(monitorId), limit: 1 })
          const last = page.items[0]
          if (!last || last.endedAt !== null) continue
          yield* resolveIncidentUseCase({ id: last.id, endedAt: new Date() })
          count += 1
        }
        return count
      }).pipe(
        withScopedPostgres(Layer.mergeAll(IncidentRepositoryLive, OutboxEventWriterLive), getPostgresClient(), orgId),
        withTracing,
      ),
    )

    return { resolvedCount }
  })

const resolveIncidentInputSchema = z.object({ incidentId: z.string() })

export const resolveMonitorIncident = createServerFn({ method: "POST" })
  .inputValidator(resolveIncidentInputSchema)
  .handler(async ({ data, context }): Promise<{ readonly id: string; readonly endedAtIso: string | null }> => {
    const orgId = await resolveOrgScope(context)

    const incident = await Effect.runPromise(
      resolveIncidentUseCase({ id: AlertIncidentId(data.incidentId), endedAt: new Date() }).pipe(
        withScopedPostgres(Layer.mergeAll(IncidentRepositoryLive, OutboxEventWriterLive), getPostgresClient(), orgId),
        withTracing,
      ),
    )
    return { id: incident.id, endedAtIso: incident.endedAt?.toISOString() ?? null }
  })

// --- Create / update / delete (M5) -----------------------------------------

const NAME_MAX_LENGTH = 128
const DESCRIPTION_MAX_LENGTH = 2000

const monitorRuleSourceSchema = z.object({
  type: z.enum(["savedSearch", "monitor", "signal"]),
  id: z.string().nullable(),
})

const createAlertFieldsSchema = z.object({
  kind: userAlertKindSchema,
  source: monitorRuleSourceSchema.nullable(),
  condition: alertIncidentConditionSchema.nullish(),
  severity: alertSeveritySchema.optional(),
})

const triggerForAlertKind = (kind: UserAlertKind) =>
  kind.includes("threshold") ? "threshold" : kind.includes("escalating") ? "escalating" : "match"

const createMonitorInputSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(NAME_MAX_LENGTH),
  description: z.string().max(DESCRIPTION_MAX_LENGTH).optional(),
  rule: createAlertFieldsSchema,
  target: monitorTargetSchema.optional(),
})

export const createMonitor = createServerFn({ method: "POST" })
  .inputValidator(createMonitorInputSchema)
  .handler(async ({ data, context }): Promise<MonitorRecord> => {
    const orgId = await resolveOrgScope(context)

    const monitor = await Effect.runPromise(
      (() => {
        const rule = data.rule
        const target = data.target ?? {
          type: "savedSearch" as const,
          id: rule.source?.id ?? null,
          filterSet: undefined,
          query: null,
        }
        const trigger = triggerForAlertKind(rule.kind)
        const metric = data.target?.metric ?? { kind: "count" as const }
        return createMonitorUseCase({
          organizationId: orgId,
          projectId: ProjectId(data.projectId),
          name: data.name,
          ...(data.description !== undefined ? { description: data.description } : {}),
          target,
          rule: {
            trigger,
            config: {
              ...(data.target?.filterSet ? { filterSet: data.target.filterSet } : {}),
              metric,
              ...(rule.condition ? { condition: rule.condition as never } : {}),
            },
            severity:
              rule.severity ?? DEFAULT_SEVERITY_FOR_INCIDENT_NOTIFICATION_KEY[notificationKeyForAlertKind(rule.kind)],
          },
        })
      })().pipe(
        // SavedSearchRepository backs the semantic-search monitorability check on the watched search.
        withScopedPostgres(
          Layer.mergeAll(
            MonitorRepositoryLive,
            SavedSearchRepositoryLive,
            IncidentRepositoryLive,
            OutboxEventWriterLive,
          ),
          getPostgresClient(),
          orgId,
        ),
        withTracing,
      ),
    )
    return toMonitorRecordResolved(orgId, monitor)
  })

const updateMonitorInputSchema = z.object({
  monitorId: z.string(),
  name: z.string().min(1).max(NAME_MAX_LENGTH).optional(),
  description: z.string().max(DESCRIPTION_MAX_LENGTH).optional(),
})

export const updateMonitor = createServerFn({ method: "POST" })
  .inputValidator(updateMonitorInputSchema)
  .handler(async ({ data, context }): Promise<MonitorRecord> => {
    const orgId = await resolveOrgScope(context)

    const monitor = await Effect.runPromise(
      updateMonitorUseCase({
        id: MonitorId(data.monitorId),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      }).pipe(
        withScopedPostgres(
          Layer.mergeAll(
            MonitorRepositoryLive,
            SavedSearchRepositoryLive,
            IncidentRepositoryLive,
            OutboxEventWriterLive,
          ),
          getPostgresClient(),
          orgId,
        ),
        withTracing,
      ),
    )
    return toMonitorRecordResolved(orgId, monitor)
  })

export const deleteMonitor = createServerFn({ method: "POST" })
  .inputValidator(monitorMutationInputSchema)
  .handler(async ({ data, context }): Promise<{ readonly id: string }> => {
    const orgId = await resolveOrgScope(context)

    const monitor = await Effect.runPromise(
      deleteMonitorUseCase({ id: MonitorId(data.monitorId) }).pipe(
        withScopedPostgres(
          Layer.mergeAll(MonitorRepositoryLive, IncidentRepositoryLive, OutboxEventWriterLive),
          getPostgresClient(),
          orgId,
        ),
        withTracing,
      ),
    )
    return { id: monitor.id }
  })

const updateMonitorRuleInputSchema = z.object({
  monitorId: z.string(),
  severity: alertSeveritySchema.optional(),
})

export const updateMonitorRule = createServerFn({ method: "POST" })
  .inputValidator(updateMonitorRuleInputSchema)
  .handler(async ({ data, context }): Promise<MonitorRecord> => {
    const orgId = await resolveOrgScope(context)

    const monitor = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* MonitorRepository
        const current = yield* repository.findById(MonitorId(data.monitorId))
        return yield* updateMonitorUseCase({
          id: current.id,
          rule: {
            trigger: current.rule.trigger,
            config: current.rule.config,
            severity: data.severity ?? current.rule.severity,
          },
        })
      }).pipe(
        withScopedPostgres(
          Layer.mergeAll(
            MonitorRepositoryLive,
            SavedSearchRepositoryLive,
            IncidentRepositoryLive,
            OutboxEventWriterLive,
          ),
          getPostgresClient(),
          orgId,
        ),
        withTracing,
      ),
    )
    return toMonitorRecordResolved(orgId, monitor)
  })

/** Keyset cursor over `(endedAt, id)`; `endedAt` is `null` while paging ongoing incidents. */
const incidentCursorSchema = z.object({ endedAt: z.iso.datetime().nullable(), id: z.string() })
export type MonitorIncidentsCursor = z.infer<typeof incidentCursorSchema>

const getMonitorIncidentStatsInputSchema = z.object({ monitorId: z.string() })

export const getMonitorIncidentStats = createServerFn({ method: "GET" })
  .inputValidator(getMonitorIncidentStatsInputSchema)
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      readonly total: number
      readonly firstStartedAtIso: string | null
      readonly lastIncidentId: string | null
      readonly lastStartedAtIso: string | null
      readonly lastEndedAtIso: string | null
    }> => {
      const orgId = await resolveOrgScope(context)

      const stats = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* IncidentRepository
          return yield* repository.statsByMonitorId(MonitorId(data.monitorId))
        }).pipe(withScopedPostgres(IncidentRepositoryLive, getPostgresClient(), orgId), withTracing),
      )

      return {
        total: stats.total,
        firstStartedAtIso: stats.firstStartedAt?.toISOString() ?? null,
        lastIncidentId: stats.lastIncidentId,
        lastStartedAtIso: stats.lastStartedAt?.toISOString() ?? null,
        lastEndedAtIso: stats.lastEndedAt?.toISOString() ?? null,
      }
    },
  )

const listMonitorIncidentsInputSchema = z.object({
  projectId: z.string(),
  monitorId: z.string(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: incidentCursorSchema.optional(),
})

const toMonitorIncidentRecord = (
  item: {
    readonly incident: {
      readonly id: string
      readonly startedAt: Date
      readonly endedAt: Date | null
      readonly sourceType: string | null
      readonly sourceId: string | null
      readonly severity: string
      readonly condition?: { readonly trigger?: string } | null
    }
    readonly notified: boolean
  },
  sourceName: string | null,
  sourceSlug: string | null,
) => ({
  id: item.incident.id,
  startedAt: item.incident.startedAt.toISOString(),
  endedAt: item.incident.endedAt?.toISOString() ?? null,
  kind:
    item.incident.sourceType === "signal"
      ? "signal.escalating"
      : item.incident.condition?.trigger === "escalating"
        ? "monitor.escalating"
        : item.incident.condition?.trigger === "threshold"
          ? "monitor.threshold"
          : "monitor.match",
  sourceType: item.incident.sourceType,
  sourceId: item.incident.sourceId,
  severity: item.incident.severity,
  notified: item.notified,
  sourceName,
  sourceSlug,
})

export type MonitorIncidentRecord = ReturnType<typeof toMonitorIncidentRecord>

export const listMonitorIncidents = createServerFn({ method: "GET" })
  .inputValidator(listMonitorIncidentsInputSchema)
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      readonly items: readonly MonitorIncidentRecord[]
      readonly nextCursor: MonitorIncidentsCursor | null
      readonly hasMore: boolean
    }> => {
      const orgId = await resolveOrgScope(context)
      const projectId = ProjectId(data.projectId)
      const pgClient = getPostgresClient()

      const result = await Effect.runPromise(
        getMonitorIncidentsUseCase({
          organizationId: orgId,
          monitorId: MonitorId(data.monitorId),
          ...(data.limit !== undefined ? { limit: data.limit } : {}),
          ...(data.cursor
            ? {
                cursor: {
                  endedAt: data.cursor.endedAt ? new Date(data.cursor.endedAt) : null,
                  id: AlertIncidentId(data.cursor.id),
                },
              }
            : {}),
        }).pipe(
          withScopedPostgres(Layer.mergeAll(IncidentRepositoryLive, NotificationRepositoryLive), pgClient, orgId),
          withTracing,
        ),
      )

      // Resolve source names/slugs for the "Source" column; unresolved ids fall back to the id in the UI.
      const signalIds = [
        ...new Set(
          result.items.flatMap((i) =>
            i.incident.sourceType === "signal" && i.incident.sourceId !== null ? [i.incident.sourceId] : [],
          ),
        ),
      ]
      const signalNameById = new Map<string, string>()
      const signalSlugById = new Map<string, string>()
      if (signalIds.length > 0) {
        const issues = await Effect.runPromise(
          Effect.gen(function* () {
            const repository = yield* SignalRepository
            return yield* repository.findByIds({ projectId, signalIds: signalIds.map(SignalId) })
          }).pipe(withScopedPostgres(SignalRepositoryLive, pgClient, orgId), withTracing),
        )
        for (const issue of issues) {
          signalNameById.set(issue.id, issue.name)
          signalSlugById.set(issue.id, issue.slug)
        }
      }

      return {
        items: result.items.map((item) => {
          const { sourceType, sourceId } = item.incident
          const isSignal = sourceType === "signal" && sourceId !== null
          const sourceName = isSignal ? (signalNameById.get(sourceId) ?? null) : null
          const sourceSlug = isSignal ? (signalSlugById.get(sourceId) ?? null) : null
          return toMonitorIncidentRecord(item, sourceName, sourceSlug)
        }),
        nextCursor: result.nextCursor
          ? { endedAt: result.nextCursor.endedAt?.toISOString() ?? null, id: result.nextCursor.id }
          : null,
        hasMore: result.hasMore,
      }
    },
  )
