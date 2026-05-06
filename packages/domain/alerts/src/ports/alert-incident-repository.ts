import type { RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { AlertIncident } from "../entities/alert-incident.ts"

export interface AlertIncidentRepositoryShape {
  insert(incident: AlertIncident): Effect.Effect<void, RepositoryError, SqlClient>
}

export class AlertIncidentRepository extends Context.Service<AlertIncidentRepository, AlertIncidentRepositoryShape>()(
  "@domain/alerts/AlertIncidentRepository",
) {}
