import type {
  AlertIncidentId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SqlClient,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { AlertIncident, AlertIncidentKind, AlertIncidentSourceType } from "../entities/alert-incident.ts"

export interface CloseOpenAlertIncidentInput {
  readonly sourceType: AlertIncidentSourceType
  readonly sourceId: string
  readonly kind: AlertIncidentKind
  readonly endedAt: Date
}

export interface ListAlertIncidentsByProjectInRangeInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** Inclusive start of the window. Incidents whose lifetime overlaps `[from, to]` are returned. */
  readonly from: Date
  /** Inclusive end of the window. */
  readonly to: Date
  /** Restrict to a single source type (e.g., `"issue"`). When omitted, all source types are returned. */
  readonly sourceType?: AlertIncidentSourceType
  /**
   * Restrict to incidents tied to a single source entity (e.g., a specific issue id). Combine with
   * `sourceType` so the same id namespace is unambiguous when future source types are added.
   */
  readonly sourceId?: string
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
  /**
   * Returns every incident whose lifetime overlaps the `[from, to]` window for the given
   * project, ordered ascending by `started_at`. Uses the
   * `(organization_id, project_id, started_at)` index. An incident overlaps the window when
   * `started_at <= to` AND (`ended_at IS NULL` OR `ended_at >= from`) — ongoing incidents
   * (null `ended_at`) overlap as long as they began on or before `to`.
   */
  listByProjectInRange(
    input: ListAlertIncidentsByProjectInRangeInput,
  ): Effect.Effect<readonly AlertIncident[], RepositoryError, SqlClient>
}

export class AlertIncidentRepository extends Context.Service<AlertIncidentRepository, AlertIncidentRepositoryShape>()(
  "@domain/alerts/AlertIncidentRepository",
) {}
