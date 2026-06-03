import type { RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"

/** Monitor identity + mute state backing an incident's firing alert. */
export interface IncidentMonitorInfo {
  readonly monitorId: string
  readonly slug: string
  readonly name: string
  readonly mutedAt: Date | null
}

export interface IncidentMonitorReaderShape {
  /**
   * Resolve the owning monitor for a `monitor_alert_id` (incl. soft-deleted alerts);
   * `null` if unresolved. Owned here, not on `MonitorRepository`, to avoid the
   * `@domain/monitors` → `@domain/notifications` cycle.
   */
  findByAlertId(monitorAlertId: string): Effect.Effect<IncidentMonitorInfo | null, RepositoryError, SqlClient>
}

export class IncidentMonitorReader extends Context.Service<IncidentMonitorReader, IncidentMonitorReaderShape>()(
  "@domain/notifications/IncidentMonitorReader",
) {}
