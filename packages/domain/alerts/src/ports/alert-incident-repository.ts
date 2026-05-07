import type { AlertIncidentId, NotFoundError, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { AlertIncident, AlertIncidentKind, AlertIncidentSourceType } from "../entities/alert-incident.ts"

export interface CloseOpenAlertIncidentInput {
  readonly sourceType: AlertIncidentSourceType
  readonly sourceId: string
  readonly kind: AlertIncidentKind
  readonly endedAt: Date
}

export interface AlertIncidentRepositoryShape {
  insert(incident: AlertIncident): Effect.Effect<void, RepositoryError, SqlClient>
  findById(id: AlertIncidentId): Effect.Effect<AlertIncident, NotFoundError | RepositoryError, SqlClient>
  /**
   * Set `ended_at` on the open `(source_type, source_id, kind)` row in the
   * current organization's RLS scope. Returns the closed row's id, or `null`
   * when no open row was found.
   */
  closeOpen(input: CloseOpenAlertIncidentInput): Effect.Effect<AlertIncidentId | null, RepositoryError, SqlClient>
}

export class AlertIncidentRepository extends Context.Service<AlertIncidentRepository, AlertIncidentRepositoryShape>()(
  "@domain/alerts/AlertIncidentRepository",
) {}
