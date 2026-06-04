import type {
  AlertIncidentId,
  MonitorAlertId,
  MonitorId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SqlClient,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type {
  AlertIncident,
  AlertIncidentKind,
  AlertIncidentSourceType,
  AlertSeverity,
} from "../entities/alert-incident.ts"

export interface CloseOpenAlertIncidentInput {
  readonly sourceType: AlertIncidentSourceType
  readonly sourceId: string
  readonly kind: AlertIncidentKind
  readonly endedAt: Date
}

export interface FindOpenAlertIncidentInput {
  readonly sourceType: AlertIncidentSourceType
  readonly sourceId: string
  readonly kind: AlertIncidentKind
}

export interface UpdateAlertIncidentExitDwellInput {
  readonly id: AlertIncidentId
  /** `null` clears the dwell start when the exit-shape condition no longer holds. */
  readonly exitEligibleSince: Date | null
}

export interface SetAlertIncidentEndedAtInput {
  readonly id: AlertIncidentId
  readonly endedAt: Date
}

export interface ListAlertIncidentsByProjectInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /**
   * Inclusive start of the time window. Incidents whose lifetime overlaps `[from, to]` are
   * returned. When omitted, the window has no lower bound.
   */
  readonly from?: Date
  /** Inclusive end of the time window. When omitted, the window has no upper bound. */
  readonly to?: Date
  /**
   * Restrict to one or more source types (e.g., `["issue"]`). When omitted or empty, all source
   * types are returned.
   */
  readonly sourceTypes?: readonly AlertIncidentSourceType[]
  /**
   * Restrict to incidents tied to a single source entity (e.g., a specific issue id). Combine with
   * `sourceTypes` so the same id namespace is unambiguous when future source types are added.
   */
  readonly sourceId?: string
  /** Restrict to one or more incident kinds. Omit or pass an empty array to include all kinds. */
  readonly kinds?: readonly AlertIncidentKind[]
  /** Restrict to one or more severities. Omit or pass an empty array to include all severities. */
  readonly severities?: readonly AlertSeverity[]
}

/** Keyset cursor; `endedAt` is `null` while paging the ongoing (`ended_at NULL`) block. */
export interface AlertIncidentCursor {
  readonly endedAt: Date | null
  readonly id: AlertIncidentId
}

export interface ListAlertIncidentsByMonitorIdInput {
  readonly monitorId: MonitorId
  readonly limit: number
  readonly cursor?: AlertIncidentCursor
}

export interface ListAlertIncidentsByMonitorAlertIdInput {
  readonly monitorAlertId: MonitorAlertId
  readonly limit: number
  readonly cursor?: AlertIncidentCursor
}

export interface AlertIncidentListPage {
  readonly items: readonly AlertIncident[]
  /** Cursor for the next page, or `null` when there are no more rows. */
  readonly nextCursor: AlertIncidentCursor | null
  readonly hasMore: boolean
}

export interface MonitorIncidentStats {
  readonly total: number
  /** `started_at` of the first (oldest) incident — "first detected at". */
  readonly firstStartedAt: Date | null
  /** Last incident's `started_at` (ongoing-first pick); the fallback for "last detected at" when it's still open. */
  readonly lastStartedAt: Date | null
  /** Last incident's `ended_at` — "last detected at"; `null` while that incident is ongoing. */
  readonly lastEndedAt: Date | null
}

export interface AlertIncidentRepositoryShape {
  insert(incident: AlertIncident): Effect.Effect<void, RepositoryError, SqlClient>
  findById(id: AlertIncidentId): Effect.Effect<AlertIncident, NotFoundError | RepositoryError, SqlClient>
  /**
   * Return the open `(source_type, source_id, kind)` incident in the current
   * organization's RLS scope, or `null` when no open row exists. Read path
   * for the escalation check use case so it can inspect the entry snapshot
   * and dwell tracker on subsequent ticks.
   */
  findOpen(input: FindOpenAlertIncidentInput): Effect.Effect<AlertIncident | null, RepositoryError, SqlClient>
  /**
   * Set `ended_at` on the open `(source_type, source_id, kind)` row in the
   * current organization's RLS scope. Returns the closed row's id, or `null`
   * when no open row was found.
   */
  closeOpen(input: CloseOpenAlertIncidentInput): Effect.Effect<AlertIncidentId | null, RepositoryError, SqlClient>
  /**
   * Targeted write that only touches `exit_eligible_since` on the given row.
   * Used by the escalation check use case to start, hold, or clear the
   * temporal dwell that gates band-shape exits — separate from `closeOpen`
   * because the dwell can advance many times without the incident closing.
   */
  updateExitDwell(input: UpdateAlertIncidentExitDwellInput): Effect.Effect<void, RepositoryError, SqlClient>
  /** The open incident fired by `monitorAlertId` (org scope), or `null`. Saved-search machines track lifecycle per firing alert, not per `(source, kind)`. */
  findOpenByMonitorAlertId(
    monitorAlertId: MonitorAlertId,
  ): Effect.Effect<AlertIncident | null, RepositoryError, SqlClient>
  /** Whether `monitorAlertId` has ever fired (org scope). Backs the absolute-threshold one-time short-circuit. */
  existsByMonitorAlertId(monitorAlertId: MonitorAlertId): Effect.Effect<boolean, RepositoryError, SqlClient>
  /** Set `ended_at` on one incident by id (org scope) — the saved-search machines already hold the row; close events (if any) are emitted by the caller. */
  setEndedAt(input: SetAlertIncidentEndedAtInput): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Returns every incident in the project whose lifetime overlaps the optional `[from, to]`
   * window, ordered ascending by `started_at`. Uses the
   * `(organization_id, project_id, started_at)` index. An incident overlaps the window when
   * `started_at <= to` AND (`ended_at IS NULL` OR `ended_at >= from`) — ongoing incidents
   * (null `ended_at`) overlap as long as they began on or before `to`. Each bound is
   * skipped when omitted, so passing no bounds returns every incident for the project.
   * Additional optional filters narrow by `sourceType`, `sourceId`, `kind`, and `severity`.
   */
  listByProjectId(
    input: ListAlertIncidentsByProjectInput,
  ): Effect.Effect<readonly AlertIncident[], RepositoryError, SqlClient>
  /**
   * Returns every currently-open (`ended_at IS NULL`) incident matching `kind`,
   * ordered ascending by `started_at`. Cross-org by design — drive through the
   * admin Postgres client so RLS is bypassed. Backs the hourly escalation sweep:
   * the system needs a way to find every stuck-open `issue.escalating` row
   * regardless of which org owns it, then enqueue a per-issue recheck for each.
   */
  listOpenByKind(kind: AlertIncidentKind): Effect.Effect<readonly AlertIncident[], RepositoryError, SqlClient>
  /**
   * Incidents owned by a monitor (`ended_at DESC NULLS FIRST, id DESC`, paginated). Joins
   * through `monitor_alerts` incl. soft-deleted, so an incident keeps showing after its alert is removed.
   */
  listByMonitorId(
    input: ListAlertIncidentsByMonitorIdInput,
  ): Effect.Effect<AlertIncidentListPage, RepositoryError, SqlClient>
  /** Joins through `monitor_alerts` incl. soft-deleted; `0` / `null`s when the monitor has no incidents. */
  statsByMonitorId(monitorId: MonitorId): Effect.Effect<MonitorIncidentStats, RepositoryError, SqlClient>
  /** Incidents fired by one specific alert (`ended_at DESC NULLS FIRST, id DESC`, paginated) — direct `monitor_alert_id` lookup. */
  listByMonitorAlertId(
    input: ListAlertIncidentsByMonitorAlertIdInput,
  ): Effect.Effect<AlertIncidentListPage, RepositoryError, SqlClient>
}

export class AlertIncidentRepository extends Context.Service<AlertIncidentRepository, AlertIncidentRepositoryShape>()(
  "@domain/alerts/AlertIncidentRepository",
) {}
