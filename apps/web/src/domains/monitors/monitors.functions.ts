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
  muteMonitorUseCase,
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
  MonitorAlertId,
  MonitorId,
  OrganizationId,
  ProjectId,
} from "@domain/shared"
import {
  AlertIncidentRepositoryLive,
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

const toListMonitorsResultRecord = (result: ListMonitorsResult, savedSearchNames: ReadonlyMap<string, string>) => ({
  items: result.items.map((monitor) => toMonitorRecord(monitor, savedSearchNames)),
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

/** Keyset cursor over `(startedAt, id)`; `startedAt` is an ISO string on the wire. */
const incidentCursorSchema = z.object({ startedAt: z.iso.datetime(), id: z.string() })
export type MonitorIncidentsCursor = z.infer<typeof incidentCursorSchema>

const listMonitorIncidentsInputSchema = z.object({
  monitorId: z.string(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: incidentCursorSchema.optional(),
})

const toMonitorIncidentRecord = (item: {
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
}) => ({
  id: item.incident.id,
  startedAt: item.incident.startedAt.toISOString(),
  endedAt: item.incident.endedAt?.toISOString() ?? null,
  kind: item.incident.kind,
  sourceType: item.incident.sourceType,
  sourceId: item.incident.sourceId,
  severity: item.incident.severity,
  notified: item.notified,
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
      const pgClient = getPostgresClient()

      const result = await Effect.runPromise(
        getMonitorIncidentsUseCase({
          organizationId: orgId,
          monitorId: MonitorId(data.monitorId),
          ...(data.limit !== undefined ? { limit: data.limit } : {}),
          ...(data.cursor
            ? { cursor: { startedAt: new Date(data.cursor.startedAt), id: AlertIncidentId(data.cursor.id) } }
            : {}),
        }).pipe(
          withPostgres(Layer.mergeAll(AlertIncidentRepositoryLive, NotificationRepositoryLive), pgClient, orgId),
          withTracing,
        ),
      )

      return {
        items: result.items.map(toMonitorIncidentRecord),
        nextCursor: result.nextCursor
          ? { startedAt: result.nextCursor.startedAt.toISOString(), id: result.nextCursor.id }
          : null,
        hasMore: result.hasMore,
      }
    },
  )
