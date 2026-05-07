import type { RepositoryError, SqlClient } from "@domain/shared"
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
  /**
   * Set `ended_at` on the open `(source_type, source_id, kind)` row in the
   * current organization's RLS scope. No-op if no open row exists.
   */
  closeOpen(input: CloseOpenAlertIncidentInput): Effect.Effect<void, RepositoryError, SqlClient>
}

export class AlertIncidentRepository extends Context.Service<AlertIncidentRepository, AlertIncidentRepositoryShape>()(
  "@domain/alerts/AlertIncidentRepository",
) {}
