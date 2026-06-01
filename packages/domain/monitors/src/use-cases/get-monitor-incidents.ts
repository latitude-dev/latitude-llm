import { type AlertIncident, type AlertIncidentCursor, AlertIncidentRepository } from "@domain/alerts"
import { NotificationRepository } from "@domain/notifications"
import type { MonitorId, OrganizationId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

export interface GetMonitorIncidentsInput {
  readonly organizationId: OrganizationId
  readonly monitorId: MonitorId
  /** Default 50, clamped to 100. */
  readonly limit?: number
  /** Keyset cursor; omit for the first page. */
  readonly cursor?: AlertIncidentCursor
}

export interface MonitorIncidentItem {
  readonly incident: AlertIncident
  /** True if any of the incident's notification idempotency keys exists — the "Notified"/"Muted" badge. */
  readonly notified: boolean
}

export interface GetMonitorIncidentsResult {
  readonly items: readonly MonitorIncidentItem[]
  readonly nextCursor: AlertIncidentCursor | null
  readonly hasMore: boolean
}

const incidentNotificationKeys = (incidentId: string): readonly string[] => [
  `incident.event:${incidentId}`,
  `incident.opened:${incidentId}`,
  `incident.closed:${incidentId}`,
]

export const getMonitorIncidentsUseCase = (
  input: GetMonitorIncidentsInput,
): Effect.Effect<
  GetMonitorIncidentsResult,
  RepositoryError,
  SqlClient | AlertIncidentRepository | NotificationRepository
> =>
  Effect.gen(function* () {
    const alertIncidentRepository = yield* AlertIncidentRepository
    const notificationRepository = yield* NotificationRepository

    const limit = Math.min(input.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

    const page = yield* alertIncidentRepository.listByMonitorId({
      monitorId: input.monitorId,
      limit,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    })

    if (page.items.length === 0) {
      return { items: [], nextCursor: page.nextCursor, hasMore: page.hasMore }
    }

    const candidateKeys = page.items.flatMap((incident) => incidentNotificationKeys(incident.id))
    const presentKeys = yield* notificationRepository.findExistingIdempotencyKeys({
      organizationId: input.organizationId,
      keys: candidateKeys,
    })
    const presentKeySet = new Set(presentKeys)

    const items = page.items.map((incident) => ({
      incident,
      notified: incidentNotificationKeys(incident.id).some((key) => presentKeySet.has(key)),
    }))

    return { items, nextCursor: page.nextCursor, hasMore: page.hasMore }
  })
