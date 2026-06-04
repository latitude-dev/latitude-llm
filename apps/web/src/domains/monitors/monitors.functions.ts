import { AlertIncidentRepository } from "@domain/alerts"
import { IssueRepository } from "@domain/issues"
import {
  createMonitorAlertUseCase,
  createMonitorUseCase,
  deleteMonitorAlertUseCase,
  deleteMonitorUseCase,
  formatHumanReadableAlert,
  getMonitorBySlugUseCase,
  getMonitorIncidentsUseCase,
  type ListMonitorsResult,
  listMonitorsUseCase,
  type Monitor,
  type MonitorAlert,
  type MonitorAlertInput,
  type MonitorLastIncident,
  type MonitorSearchResult,
  muteMonitorUseCase,
  searchMonitorsUseCase,
  unmuteMonitorUseCase,
  updateMonitorAlertUseCase,
  updateMonitorUseCase,
} from "@domain/monitors"
import { listSavedSearches } from "@domain/saved-searches"
import {
  AlertIncidentId,
  alertIncidentConditionSchema,
  alertIncidentKindSchema,
  alertIncidentSourceTypeSchema,
  alertSeveritySchema,
  IssueId,
  MonitorAlertId,
  MonitorId,
  OrganizationId,
  ProjectId,
} from "@domain/shared"
import {
  AlertIncidentRepositoryLive,
  IssueRepositoryLive,
  MonitorRepositoryLive,
  NotificationRepositoryLive,
  SavedSearchRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

const toMonitorAlertRecord = (alert: MonitorAlert, savedSearchNames: ReadonlyMap<string, string>) => {
  const savedSearchName = alert.source.id ? savedSearchNames.get(alert.source.id) : undefined
  return {
    id: alert.id,
    monitorId: alert.monitorId,
    kind: alert.kind,
    source: { type: alert.source.type, id: alert.source.id },
    condition: alert.condition,
    severity: alert.severity,
    // Rendered server-side so the panel/list don't pull `@domain/monitors` into
    // the client bundle. Saved-search summaries carry the source name when known.
    summary: formatHumanReadableAlert(alert, savedSearchName ? { savedSearchName } : undefined),
    createdAt: alert.createdAt.toISOString(),
  }
}

/** @public Consumed by the M4/M5 alert form + details panel; not yet wired in M2. */
export type MonitorAlertRecord = ReturnType<typeof toMonitorAlertRecord>

const toMonitorRecord = (monitor: Monitor, savedSearchNames: ReadonlyMap<string, string>) => ({
  id: monitor.id,
  organizationId: monitor.organizationId,
  projectId: monitor.projectId,
  slug: monitor.slug,
  name: monitor.name,
  description: monitor.description,
  system: monitor.system,
  alerts: monitor.alerts.map((alert) => toMonitorAlertRecord(alert, savedSearchNames)),
  mutedAt: monitor.mutedAt?.toISOString() ?? null,
  deletedAt: monitor.deletedAt?.toISOString() ?? null,
  createdAt: monitor.createdAt.toISOString(),
  updatedAt: monitor.updatedAt.toISOString(),
})

export type MonitorRecord = ReturnType<typeof toMonitorRecord>

/**
 * Builds an id→name map for the saved searches referenced by these monitors'
 * alerts, so `formatHumanReadableAlert` can name the source. Fetches nothing
 * when no alert watches a saved search (the common all-system-monitors case).
 */
const resolveSavedSearchNames = async (
  orgId: OrganizationId,
  projectId: ProjectId,
  monitors: readonly Monitor[],
): Promise<ReadonlyMap<string, string>> => {
  const referencesSavedSearch = monitors.some((monitor) =>
    monitor.alerts.some((alert) => alert.source.type === "savedSearch" && alert.source.id !== null),
  )
  if (!referencesSavedSearch) return new Map()
  const page = await Effect.runPromise(
    listSavedSearches({ projectId }).pipe(
      withPostgres(SavedSearchRepositoryLive, getPostgresClient(), orgId),
      withTracing,
    ),
  )
  return new Map(page.items.map((search) => [search.id, search.name]))
}

/** Resolve saved-search names for a single monitor, then map it to its wire record. */
const toMonitorRecordResolved = async (orgId: OrganizationId, monitor: Monitor): Promise<MonitorRecord> => {
  const names = await resolveSavedSearchNames(orgId, monitor.projectId, [monitor])
  return toMonitorRecord(monitor, names)
}

export interface MonitorLastIncidentRecord {
  readonly startedAtIso: string
  readonly endedAtIso: string | null
}

export interface MonitorListRowRecord {
  readonly monitor: MonitorRecord
  readonly lastIncident: MonitorLastIncidentRecord | null
}

const toMonitorListRowRecord = (
  monitor: Monitor,
  savedSearchNames: ReadonlyMap<string, string>,
  last: MonitorLastIncident | undefined,
): MonitorListRowRecord => ({
  monitor: toMonitorRecord(monitor, savedSearchNames),
  lastIncident: last
    ? { startedAtIso: last.startedAt.toISOString(), endedAtIso: last.endedAt?.toISOString() ?? null }
    : null,
})

const toListMonitorsResultRecord = (result: ListMonitorsResult, savedSearchNames: ReadonlyMap<string, string>) => ({
  items: result.items.map((monitor) =>
    toMonitorListRowRecord(monitor, savedSearchNames, result.lastIncidentByMonitorId.get(monitor.id)),
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
      }).pipe(withPostgres(MonitorRepositoryLive, pgClient, orgId), withTracing),
    )

    const names = await resolveSavedSearchNames(orgId, ProjectId(data.projectId), result.items)
    return toListMonitorsResultRecord(result, names)
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

// --- Create / update / delete (M5) -----------------------------------------

const NAME_MAX_LENGTH = 128
const DESCRIPTION_MAX_LENGTH = 2000

const monitorAlertSourceSchema = z.object({ type: alertIncidentSourceTypeSchema, id: z.string().nullable() })

/** Shared alert-creation fields; `condition`/`severity` default in the use-case. */
const createAlertFieldsSchema = z.object({
  kind: alertIncidentKindSchema,
  source: monitorAlertSourceSchema,
  condition: alertIncidentConditionSchema.nullish(),
  severity: alertSeveritySchema.optional(),
})

const toAlertInput = (fields: z.infer<typeof createAlertFieldsSchema>): MonitorAlertInput => ({
  kind: fields.kind,
  source: { type: fields.source.type, id: fields.source.id },
  condition: fields.condition ?? null,
  ...(fields.severity !== undefined ? { severity: fields.severity } : {}),
})

const createMonitorInputSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(NAME_MAX_LENGTH),
  description: z.string().max(DESCRIPTION_MAX_LENGTH).optional(),
  alerts: z.array(createAlertFieldsSchema).min(1),
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
      }).pipe(withPostgres(MonitorRepositoryLive, getPostgresClient(), orgId), withTracing),
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

const createMonitorAlertInputSchema = createAlertFieldsSchema.extend({ monitorId: z.string() })

export const createMonitorAlert = createServerFn({ method: "POST" })
  .inputValidator(createMonitorAlertInputSchema)
  .handler(async ({ data }): Promise<MonitorRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const monitor = await Effect.runPromise(
      createMonitorAlertUseCase({ monitorId: MonitorId(data.monitorId), ...toAlertInput(data) }).pipe(
        withPostgres(MonitorRepositoryLive, getPostgresClient(), orgId),
        withTracing,
      ),
    )
    return toMonitorRecordResolved(orgId, monitor)
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
      }).pipe(withPostgres(MonitorRepositoryLive, getPostgresClient(), orgId), withTracing),
    )
    return toMonitorRecordResolved(orgId, monitor)
  })

export const deleteMonitorAlert = createServerFn({ method: "POST" })
  .inputValidator(z.object({ monitorId: z.string(), alertId: z.string() }))
  .handler(async ({ data }): Promise<MonitorRecord> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)

    const monitor = await Effect.runPromise(
      deleteMonitorAlertUseCase({
        monitorId: MonitorId(data.monitorId),
        alertId: MonitorAlertId(data.alertId),
      }).pipe(withPostgres(MonitorRepositoryLive, getPostgresClient(), orgId), withTracing),
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
      readonly lastStartedAtIso: string | null
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
        lastStartedAtIso: stats.lastStartedAt?.toISOString() ?? null,
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
      readonly sourceType: string
      readonly sourceId: string
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
      const issueIds = [
        ...new Set(result.items.filter((i) => i.incident.sourceType === "issue").map((i) => i.incident.sourceId)),
      ]
      const issueNameById = new Map<string, string>()
      if (issueIds.length > 0) {
        const issues = await Effect.runPromise(
          Effect.gen(function* () {
            const repository = yield* IssueRepository
            return yield* repository.findByIds({ projectId, issueIds: issueIds.map(IssueId) })
          }).pipe(withPostgres(IssueRepositoryLive, pgClient, orgId), withTracing),
        )
        for (const issue of issues) issueNameById.set(issue.id, issue.name)
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
          const saved = sourceType === "savedSearch" ? savedSearchById.get(sourceId) : undefined
          const sourceName = sourceType === "issue" ? (issueNameById.get(sourceId) ?? null) : (saved?.name ?? null)
          return toMonitorIncidentRecord(item, sourceName, saved?.slug ?? null)
        }),
        nextCursor: result.nextCursor
          ? { endedAt: result.nextCursor.endedAt?.toISOString() ?? null, id: result.nextCursor.id }
          : null,
        hasMore: result.hasMore,
      }
    },
  )
