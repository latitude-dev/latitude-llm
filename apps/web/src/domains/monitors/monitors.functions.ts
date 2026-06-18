import { AlertIncidentRepository, resolveAlertIncidentUseCase } from "@domain/alerts"
import { exportSelectionSchema } from "@domain/exports"
import {
  createMonitorUseCase,
  deleteMonitorUseCase,
  formatHumanReadableAlert,
  getMonitorBySlugUseCase,
  getMonitorIncidentsUseCase,
  type ListMonitorsResult,
  listMonitorsForTargetUseCase,
  listMonitorsUseCase,
  listSavedSearchMonitorSummariesUseCase,
  MetricSeriesReader,
  type MetricSeriesTarget,
  type Monitor,
  type MonitorAlert,
  type MonitorAlertInput,
  type MonitorLastIncident,
  type MonitorSearchResult,
  monitorTargetSchema,
  muteMonitorUseCase,
  searchMonitorsUseCase,
  unmuteMonitorUseCase,
  updateMonitorAlertUseCase,
  updateMonitorUseCase,
} from "@domain/monitors"
import { listSavedSearches, SavedSearchRepository } from "@domain/saved-searches"
import {
  AlertIncidentId,
  type AlertSeverity,
  alertIncidentConditionSchema,
  alertIncidentKindSchema,
  alertIncidentSourceTypeSchema,
  alertSeveritySchema,
  filterSetSchema,
  MonitorAlertId,
  MonitorId,
  monitorStreamSchema,
  OrganizationId,
  ProjectId,
  SavedSearchId,
  SignalId,
} from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { MetricSeriesReaderLive, withClickHouse } from "@platform/db-clickhouse"
import {
  AlertIncidentRepositoryLive,
  MonitorRepositoryLive,
  NotificationRepositoryLive,
  OutboxEventWriterLive,
  SavedSearchRepositoryLive,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient } from "../../server/clients.ts"

interface SavedSearchRef {
  readonly name: string
  readonly slug: string
}

const toMonitorAlertRecord = (alert: MonitorAlert, savedSearchRefs: ReadonlyMap<string, SavedSearchRef>) => {
  const ref = alert.source?.id ? savedSearchRefs.get(alert.source.id) : undefined
  return {
    id: alert.id,
    monitorId: alert.monitorId,
    kind: alert.kind,
    source: alert.source ? { type: alert.source.type, id: alert.source.id } : null,
    condition: alert.condition,
    severity: alert.severity,
    // Rendered server-side so the panel/list don't pull `@domain/monitors` into
    // the client bundle. Saved-search summaries carry the source name when known.
    summary: formatHumanReadableAlert(alert, ref ? { savedSearchName: ref.name } : undefined),
    sourceName: ref?.name ?? null,
    sourceSlug: ref?.slug ?? null,
    createdAt: alert.createdAt.toISOString(),
  }
}

/** @public Consumed by the M4/M5 alert form + details panel; not yet wired in M2. */
export type MonitorAlertRecord = ReturnType<typeof toMonitorAlertRecord>

const toMonitorRecord = (monitor: Monitor, savedSearchRefs: ReadonlyMap<string, SavedSearchRef>) => ({
  id: monitor.id,
  organizationId: monitor.organizationId,
  projectId: monitor.projectId,
  slug: monitor.slug,
  name: monitor.name,
  description: monitor.description,
  system: monitor.system,
  alerts: monitor.alerts.map((alert) => toMonitorAlertRecord(alert, savedSearchRefs)),
  target: monitor.target,
  mutedAt: monitor.mutedAt?.toISOString() ?? null,
  deletedAt: monitor.deletedAt?.toISOString() ?? null,
  createdAt: monitor.createdAt.toISOString(),
  updatedAt: monitor.updatedAt.toISOString(),
})

export type MonitorRecord = ReturnType<typeof toMonitorRecord>

/**
 * Builds an id→{name,slug} map for the saved searches referenced by these
 * monitors' alerts, so `formatHumanReadableAlert` can name the source and the
 * alert records can carry the traces-page deep link. Fetches nothing when no
 * alert watches a saved search (the common all-system-monitors case).
 */
const resolveSavedSearchRefs = async (
  orgId: OrganizationId,
  projectId: ProjectId,
  monitors: readonly Monitor[],
): Promise<ReadonlyMap<string, SavedSearchRef>> => {
  const referencesSavedSearch = monitors.some((monitor) =>
    monitor.alerts.some((alert) => alert.source?.type === "savedSearch" && alert.source.id !== null),
  )
  if (!referencesSavedSearch) return new Map()
  const page = await Effect.runPromise(
    listSavedSearches({ projectId }).pipe(
      withPostgres(SavedSearchRepositoryLive, getPostgresClient(), orgId),
      withTracing,
    ),
  )
  return new Map(page.items.map((search) => [search.id, { name: search.name, slug: search.slug }]))
}

/** Resolve saved-search refs for a single monitor, then map it to its wire record. */
const toMonitorRecordResolved = async (orgId: OrganizationId, monitor: Monitor): Promise<MonitorRecord> => {
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
  .handler(async ({ data }): Promise<ListMonitorsResultRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const pgClient = getPostgresClient()

    const result = await Effect.runPromise(
      listMonitorsUseCase({
        projectId: ProjectId(data.projectId),
        ...(data.limit !== undefined ? { limit: data.limit } : {}),
        ...(data.offset !== undefined ? { offset: data.offset } : {}),
        ...(data.searchQuery ? { searchQuery: data.searchQuery } : {}),
        ...(data.system !== undefined ? { system: data.system } : {}),
      }).pipe(withPostgres(MonitorRepositoryLive, pgClient, orgId), withTracing),
    )

    const refs = await resolveSavedSearchRefs(orgId, ProjectId(data.projectId), result.items)
    return toListMonitorsResultRecord(result, refs)
  })

const listMonitorsForTargetInputSchema = z.object({
  projectId: z.string(),
  stream: monitorStreamSchema,
  filterSetContains: filterSetSchema,
})

/** Live unified monitors targeting a specific tool/user — backs the in-context "monitors for this X" card. */
export const listMonitorsForTarget = createServerFn({ method: "GET" })
  .inputValidator(listMonitorsForTargetInputSchema)
  .handler(async ({ data }): Promise<MonitorRecord[]> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const monitors = await Effect.runPromise(
      listMonitorsForTargetUseCase({
        projectId: ProjectId(data.projectId),
        stream: data.stream,
        filterSetContains: data.filterSetContains,
      }).pipe(withPostgres(MonitorRepositoryLive, getPostgresClient(), orgId), withTracing),
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

/** Resolve a monitor's persisted target to the metric reader's `(stream, filterSet, query, metric)`. */
const resolveMetricTarget = (target: NonNullable<Monitor["target"]>) =>
  Effect.gen(function* () {
    if (target.savedSearchId !== null) {
      const search = yield* (yield* SavedSearchRepository)
        .findById(SavedSearchId(target.savedSearchId))
        .pipe(Effect.catchTag("SavedSearchNotFoundError", () => Effect.succeed(null)))
      if (search === null) return null
      return {
        stream: target.stream,
        filterSet: search.filterSet,
        query: search.query,
        metric: target.metric,
      } satisfies MetricSeriesTarget
    }
    return {
      stream: target.stream,
      filterSet: target.filterSet ?? {},
      query: target.query,
      metric: target.metric,
    } satisfies MetricSeriesTarget
  })

/** The monitor's tracked metric as a per-bucket series over `[fromMs, toMs)` — powers the monitor page histogram. */
export const getMonitorMetricSeries = createServerFn({ method: "GET" })
  .inputValidator(getMonitorMetricSeriesInputSchema)
  .handler(async ({ data }): Promise<MonitorMetricSeriesRecord | null> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const bucketMs = data.bucketMs
    const to = new Date(data.toMs)
    const from = new Date(data.fromMs)

    return Effect.runPromise(
      Effect.gen(function* () {
        const monitor = yield* getMonitorBySlugUseCase({ projectId, slug: data.monitorSlug }).pipe(
          Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
        )
        if (monitor === null || monitor.target === null) return null
        const target = yield* resolveMetricTarget(monitor.target)
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
        withPostgres(Layer.mergeAll(MonitorRepositoryLive, SavedSearchRepositoryLive), getPostgresClient(), orgId),
        withClickHouse(MetricSeriesReaderLive, getClickhouseClient(), orgId),
        withTracing,
      ),
    )
  })

export interface SavedSearchMonitorSummaryRecord {
  readonly monitorSlug: string
  readonly monitorCount: number
  readonly severities: readonly AlertSeverity[]
  /** Each watching monitor, earliest first — drives the chip's picker. */
  readonly monitors: readonly {
    readonly slug: string
    readonly name: string
    readonly muted: boolean
    readonly severities: readonly AlertSeverity[]
  }[]
}

/**
 * Batched lookup powering the saved-search ↔ monitor linkage in the UI (selector rows, the
 * monitored-state chip): a map of `savedSearchId -> { monitorSlug, monitorCount, severities }`.
 */
export const listSavedSearchMonitorSummaries = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<Record<string, SavedSearchMonitorSummaryRecord>> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const pgClient = getPostgresClient()

    const rows = await Effect.runPromise(
      listSavedSearchMonitorSummariesUseCase({ projectId: ProjectId(data.projectId) }).pipe(
        withPostgres(MonitorRepositoryLive, pgClient, orgId),
        withTracing,
      ),
    )
    return Object.fromEntries(
      rows.map((row) => [
        row.savedSearchId,
        {
          monitorSlug: row.monitorSlug,
          monitorCount: row.monitorCount,
          severities: row.severities,
          monitors: row.monitors,
        },
      ]),
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
  .handler(async ({ data }): Promise<readonly MonitorSearchRecord[]> => {
    const { organizationId } = await requireSession()
    const pgClient = getPostgresClient()

    const results = await Effect.runPromise(
      searchMonitorsUseCase({
        ...(data.searchQuery !== undefined ? { searchQuery: data.searchQuery } : {}),
        ...(data.preferProjectId !== undefined ? { preferProjectId: ProjectId(data.preferProjectId) } : {}),
        ...(data.limit !== undefined ? { limit: data.limit } : {}),
      }).pipe(withPostgres(MonitorRepositoryLive, pgClient, OrganizationId(organizationId)), withTracing),
    )

    return results.map(toMonitorSearchRecord)
  })

const getMonitorInputSchema = z.object({
  projectId: z.string(),
  slug: z.string().min(1).max(128),
})

export const getMonitorBySlug = createServerFn({ method: "GET" })
  .inputValidator(getMonitorInputSchema)
  .handler(async ({ data }): Promise<MonitorRecord | null> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const pgClient = getPostgresClient()

    const monitor = await Effect.runPromise(
      getMonitorBySlugUseCase({ projectId: ProjectId(data.projectId), slug: data.slug }).pipe(
        Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
        withPostgres(MonitorRepositoryLive, pgClient, orgId),
        withTracing,
      ),
    )

    return monitor ? toMonitorRecordResolved(orgId, monitor) : null
  })

const monitorMutationInputSchema = z.object({ monitorId: z.string() })

const runMonitorMute = async (monitorId: string, muted: boolean): Promise<MonitorRecord> => {
  const { organizationId } = await requireSession()
  const orgId = OrganizationId(organizationId)
  const useCase = muted ? muteMonitorUseCase : unmuteMonitorUseCase

  const monitor = await Effect.runPromise(
    useCase({ id: MonitorId(monitorId) }).pipe(
      withPostgres(MonitorRepositoryLive, getPostgresClient(), orgId),
      withTracing,
    ),
  )
  return toMonitorRecordResolved(orgId, monitor)
}

export const muteMonitor = createServerFn({ method: "POST" })
  .inputValidator(monitorMutationInputSchema)
  .handler(({ data }): Promise<MonitorRecord> => runMonitorMute(data.monitorId, true))

export const unmuteMonitor = createServerFn({ method: "POST" })
  .inputValidator(monitorMutationInputSchema)
  .handler(({ data }): Promise<MonitorRecord> => runMonitorMute(data.monitorId, false))

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
  orgId: OrganizationId,
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
    }).pipe(withPostgres(MonitorRepositoryLive, getPostgresClient(), orgId), withTracing),
  )

  return ids
}

export const bulkMuteMonitors = createServerFn({ method: "POST" })
  .inputValidator(bulkMonitorsInputSchema)
  .handler(async ({ data }): Promise<{ readonly mutedCount: number }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
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
      }).pipe(withPostgres(MonitorRepositoryLive, getPostgresClient(), orgId), withTracing),
    )

    return { mutedCount }
  })

export const bulkDeleteMonitors = createServerFn({ method: "POST" })
  .inputValidator(bulkMonitorsInputSchema)
  .handler(async ({ data }): Promise<{ readonly deletedCount: number; readonly skippedSystemCount: number }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
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
      }).pipe(withPostgres(MonitorRepositoryLive, getPostgresClient(), orgId), withTracing),
    )

    return counts
  })

export const bulkResolveMonitorLastIncidents = createServerFn({ method: "POST" })
  .inputValidator(bulkMonitorsInputSchema)
  .handler(async ({ data }): Promise<{ readonly resolvedCount: number }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const monitorIds = await resolveBulkSelectionMonitorIds(orgId, data)

    const resolvedCount = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* AlertIncidentRepository
        let count = 0
        for (const monitorId of monitorIds) {
          // Same ongoing-first pick the dashboard's "Last incident" column shows.
          const page = yield* repository.listByMonitorId({ monitorId: MonitorId(monitorId), limit: 1 })
          const last = page.items[0]
          if (!last || last.endedAt !== null) continue
          yield* resolveAlertIncidentUseCase({ id: last.id, endedAt: new Date() })
          count += 1
        }
        return count
      }).pipe(
        withPostgres(Layer.mergeAll(AlertIncidentRepositoryLive, OutboxEventWriterLive), getPostgresClient(), orgId),
        withTracing,
      ),
    )

    return { resolvedCount }
  })

const resolveIncidentInputSchema = z.object({ incidentId: z.string() })

export const resolveMonitorIncident = createServerFn({ method: "POST" })
  .inputValidator(resolveIncidentInputSchema)
  .handler(async ({ data }): Promise<{ readonly id: string; readonly endedAtIso: string | null }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const incident = await Effect.runPromise(
      resolveAlertIncidentUseCase({ id: AlertIncidentId(data.incidentId), endedAt: new Date() }).pipe(
        withPostgres(Layer.mergeAll(AlertIncidentRepositoryLive, OutboxEventWriterLive), getPostgresClient(), orgId),
        withTracing,
      ),
    )
    return { id: incident.id, endedAtIso: incident.endedAt?.toISOString() ?? null }
  })

// --- Create / update / delete (M5) -----------------------------------------

const NAME_MAX_LENGTH = 128
const DESCRIPTION_MAX_LENGTH = 2000

const monitorAlertSourceSchema = z.object({ type: alertIncidentSourceTypeSchema, id: z.string().nullable() })

/** Shared alert-creation fields; `condition`/`severity` default in the use-case. `source` is null for unified `event.*`/`metric.*` alerts (target on the monitor). */
const createAlertFieldsSchema = z.object({
  kind: alertIncidentKindSchema,
  source: monitorAlertSourceSchema.nullable(),
  condition: alertIncidentConditionSchema.nullish(),
  severity: alertSeveritySchema.optional(),
})

const toAlertInput = (fields: z.infer<typeof createAlertFieldsSchema>): MonitorAlertInput => ({
  kind: fields.kind,
  source: fields.source ? { type: fields.source.type, id: fields.source.id } : null,
  condition: fields.condition ?? null,
  ...(fields.severity !== undefined ? { severity: fields.severity } : {}),
})

const createMonitorInputSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(NAME_MAX_LENGTH),
  description: z.string().max(DESCRIPTION_MAX_LENGTH).optional(),
  // The app creates a monitor with exactly one alert; alerts are never added afterwards.
  alerts: z.array(createAlertFieldsSchema).length(1),
  // Present for unified (tool/user/raw-stream) monitors; absent for saved-search monitors.
  target: monitorTargetSchema.optional(),
})

export const createMonitor = createServerFn({ method: "POST" })
  .inputValidator(createMonitorInputSchema)
  .handler(async ({ data }): Promise<MonitorRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const monitor = await Effect.runPromise(
      createMonitorUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        name: data.name,
        ...(data.description !== undefined ? { description: data.description } : {}),
        alerts: data.alerts.map(toAlertInput),
        ...(data.target !== undefined ? { target: data.target } : {}),
      }).pipe(
        // SavedSearchRepository backs the semantic-search monitorability check on the watched search.
        withPostgres(Layer.mergeAll(MonitorRepositoryLive, SavedSearchRepositoryLive), getPostgresClient(), orgId),
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
  .handler(async ({ data }): Promise<MonitorRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const monitor = await Effect.runPromise(
      updateMonitorUseCase({
        id: MonitorId(data.monitorId),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      }).pipe(withPostgres(MonitorRepositoryLive, getPostgresClient(), orgId), withTracing),
    )
    return toMonitorRecordResolved(orgId, monitor)
  })

export const deleteMonitor = createServerFn({ method: "POST" })
  .inputValidator(monitorMutationInputSchema)
  .handler(async ({ data }): Promise<{ readonly id: string }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const monitor = await Effect.runPromise(
      deleteMonitorUseCase({ id: MonitorId(data.monitorId) }).pipe(
        withPostgres(MonitorRepositoryLive, getPostgresClient(), orgId),
        withTracing,
      ),
    )
    return { id: monitor.id }
  })

const updateMonitorAlertInputSchema = z.object({
  monitorId: z.string(),
  alertId: z.string(),
  kind: alertIncidentKindSchema.optional(),
  source: monitorAlertSourceSchema.optional(),
  condition: alertIncidentConditionSchema.nullish(),
  severity: alertSeveritySchema.optional(),
})

export const updateMonitorAlert = createServerFn({ method: "POST" })
  .inputValidator(updateMonitorAlertInputSchema)
  .handler(async ({ data }): Promise<MonitorRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const monitor = await Effect.runPromise(
      updateMonitorAlertUseCase({
        monitorId: MonitorId(data.monitorId),
        alertId: MonitorAlertId(data.alertId),
        ...(data.kind !== undefined ? { kind: data.kind } : {}),
        ...(data.source !== undefined ? { source: { type: data.source.type, id: data.source.id } } : {}),
        ...(data.condition !== undefined ? { condition: data.condition } : {}),
        ...(data.severity !== undefined ? { severity: data.severity } : {}),
      }).pipe(
        // SavedSearchRepository backs the semantic-search monitorability check when the source changes.
        withPostgres(Layer.mergeAll(MonitorRepositoryLive, SavedSearchRepositoryLive), getPostgresClient(), orgId),
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
    }): Promise<{
      readonly total: number
      readonly firstStartedAtIso: string | null
      readonly lastIncidentId: string | null
      readonly lastStartedAtIso: string | null
      readonly lastEndedAtIso: string | null
    }> => {
      const { organizationId } = await requireSession()
      const orgId = OrganizationId(organizationId)

      const stats = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* AlertIncidentRepository
          return yield* repository.statsByMonitorId(MonitorId(data.monitorId))
        }).pipe(withPostgres(AlertIncidentRepositoryLive, getPostgresClient(), orgId), withTracing),
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
      readonly kind: string
      readonly sourceType: string | null
      readonly sourceId: string | null
      readonly severity: string
    }
    readonly notified: boolean
  },
  sourceName: string | null,
  sourceSlug: string | null,
) => ({
  id: item.incident.id,
  startedAt: item.incident.startedAt.toISOString(),
  endedAt: item.incident.endedAt?.toISOString() ?? null,
  kind: item.incident.kind,
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
    }): Promise<{
      readonly items: readonly MonitorIncidentRecord[]
      readonly nextCursor: MonitorIncidentsCursor | null
      readonly hasMore: boolean
    }> => {
      const { organizationId } = await requireSession()
      const orgId = OrganizationId(organizationId)
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
          withPostgres(Layer.mergeAll(AlertIncidentRepositoryLive, NotificationRepositoryLive), pgClient, orgId),
          withTracing,
        ),
      )

      // Resolve source names/slugs for the "Source" column; unresolved ids fall back to the id in the UI.
      const signalIds = [
        ...new Set(
          result.items.flatMap((i) =>
            i.incident.sourceType === "issue" && i.incident.sourceId !== null ? [i.incident.sourceId] : [],
          ),
        ),
      ]
      const signalNameById = new Map<string, string>()
      if (signalIds.length > 0) {
        const issues = await Effect.runPromise(
          Effect.gen(function* () {
            const repository = yield* SignalRepository
            return yield* repository.findByIds({ projectId, signalIds: signalIds.map(SignalId) })
          }).pipe(withPostgres(SignalRepositoryLive, pgClient, orgId), withTracing),
        )
        for (const issue of issues) signalNameById.set(issue.id, issue.name)
      }

      const savedSearchById = new Map<string, { readonly name: string; readonly slug: string }>()
      if (result.items.some((i) => i.incident.sourceType === "savedSearch")) {
        const page = await Effect.runPromise(
          listSavedSearches({ projectId }).pipe(withPostgres(SavedSearchRepositoryLive, pgClient, orgId), withTracing),
        )
        for (const search of page.items) savedSearchById.set(search.id, { name: search.name, slug: search.slug })
      }

      return {
        items: result.items.map((item) => {
          const { sourceType, sourceId } = item.incident
          const saved = sourceType === "savedSearch" && sourceId !== null ? savedSearchById.get(sourceId) : undefined
          const sourceName =
            sourceType === "issue" && sourceId !== null ? (signalNameById.get(sourceId) ?? null) : (saved?.name ?? null)
          return toMonitorIncidentRecord(item, sourceName, saved?.slug ?? null)
        }),
        nextCursor: result.nextCursor
          ? { endedAt: result.nextCursor.endedAt?.toISOString() ?? null, id: result.nextCursor.id }
          : null,
        hasMore: result.hasMore,
      }
    },
  )
