import type { RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"

/** Monitor identity + mute state backing a monitor-owned incident. */
export interface IncidentMonitorInfo {
  readonly monitorId: string
  readonly slug: string
  readonly name: string
  readonly mutedAt: Date | null
}

export interface IncidentMonitorReaderShape {
  findByMonitorId(monitorId: string): Effect.Effect<IncidentMonitorInfo | null, RepositoryError, SqlClient>
}

export class IncidentMonitorReader extends Context.Service<IncidentMonitorReader, IncidentMonitorReaderShape>()(
  "@domain/notifications/IncidentMonitorReader",
) {}
