import {
  formatHumanReadableAlert,
  getMonitorBySlugUseCase,
  getMonitorIncidentsUseCase,
  type ListMonitorsResult,
  listMonitorsUseCase,
  type Monitor,
  type MonitorAlert,
  muteMonitorUseCase,
  unmuteMonitorUseCase,
} from "@domain/monitors"
import { AlertIncidentId, MonitorId, OrganizationId, ProjectId } from "@domain/shared"
import {
  AlertIncidentRepositoryLive,
  MonitorRepositoryLive,
  NotificationRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

const toMonitorAlertRecord = (alert: MonitorAlert) => ({
  id: alert.id,
  monitorId: alert.monitorId,
  kind: alert.kind,
  source: { type: alert.source.type, id: alert.source.id },
  condition: alert.condition,
  severity: alert.severity,
  // Rendered server-side so the panel/list don't pull `@domain/monitors` into
  // the client bundle. Saved-search summaries gain the source name in M5.
  summary: formatHumanReadableAlert(alert),
  createdAt: alert.createdAt.toISOString(),
})

/** @public Consumed by the M4/M5 alert form + details panel; not yet wired in M2. */
export type MonitorAlertRecord = ReturnType<typeof toMonitorAlertRecord>

const toMonitorRecord = (monitor: Monitor) => ({
  id: monitor.id,
  organizationId: monitor.organizationId,
  projectId: monitor.projectId,
  slug: monitor.slug,
  name: monitor.name,
  description: monitor.description,
  system: monitor.system,
  alerts: monitor.alerts.map(toMonitorAlertRecord),
  mutedAt: monitor.mutedAt?.toISOString() ?? null,
  deletedAt: monitor.deletedAt?.toISOString() ?? null,
  createdAt: monitor.createdAt.toISOString(),
  updatedAt: monitor.updatedAt.toISOString(),
})

export type MonitorRecord = ReturnType<typeof toMonitorRecord>

const toListMonitorsResultRecord = (result: ListMonitorsResult) => ({
  items: result.items.map(toMonitorRecord),
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
    const pgClient = getPostgresClient()

    const result = await Effect.runPromise(
      listMonitorsUseCase({
        projectId: ProjectId(data.projectId),
        ...(data.limit !== undefined ? { limit: data.limit } : {}),
        ...(data.offset !== undefined ? { offset: data.offset } : {}),
        ...(data.searchQuery ? { searchQuery: data.searchQuery } : {}),
      }).pipe(withPostgres(MonitorRepositoryLive, pgClient, OrganizationId(organizationId)), withTracing),
    )

    return toListMonitorsResultRecord(result)
  })

const getMonitorInputSchema = z.object({
  projectId: z.string(),
  slug: z.string().min(1).max(128),
})

export const getMonitorBySlug = createServerFn({ method: "GET" })
  .inputValidator(getMonitorInputSchema)
  .handler(async ({ data }): Promise<MonitorRecord | null> => {
    const { organizationId } = await requireSession()
    const pgClient = getPostgresClient()

    const result = await Effect.runPromise(
      getMonitorBySlugUseCase({ projectId: ProjectId(data.projectId), slug: data.slug }).pipe(
        Effect.map(toMonitorRecord),
        Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
        withPostgres(MonitorRepositoryLive, pgClient, OrganizationId(organizationId)),
        withTracing,
      ),
    )

    return result
  })

const monitorMutationInputSchema = z.object({ monitorId: z.string() })

const runMonitorMute = async (monitorId: string, muted: boolean): Promise<MonitorRecord> => {
  const { organizationId } = await requireSession()
  const pgClient = getPostgresClient()
  const useCase = muted ? muteMonitorUseCase : unmuteMonitorUseCase

  return Effect.runPromise(
    useCase({ id: MonitorId(monitorId) }).pipe(
      Effect.map(toMonitorRecord),
      withPostgres(MonitorRepositoryLive, pgClient, OrganizationId(organizationId)),
      withTracing,
    ),
  )
}

export const muteMonitor = createServerFn({ method: "POST" })
  .inputValidator(monitorMutationInputSchema)
  .handler(({ data }): Promise<MonitorRecord> => runMonitorMute(data.monitorId, true))

export const unmuteMonitor = createServerFn({ method: "POST" })
  .inputValidator(monitorMutationInputSchema)
  .handler(({ data }): Promise<MonitorRecord> => runMonitorMute(data.monitorId, false))

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
