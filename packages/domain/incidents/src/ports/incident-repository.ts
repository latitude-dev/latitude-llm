import type {
  AlertIncidentId,
  IncidentSourceType,
  MonitorId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SqlClient,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { AlertSeverity, Incident } from "../entities/incident.ts"

export interface ProducerIncidentSourceInput {
  readonly sourceType: IncidentSourceType
  readonly sourceId: string
}

export interface CloseOpenIncidentInput extends ProducerIncidentSourceInput {
  readonly endedAt: Date
}

export interface FindOpenIncidentInput extends ProducerIncidentSourceInput {}

export interface UpdateIncidentExitDwellInput {
  readonly id: AlertIncidentId
  /** `null` clears the dwell start when the exit-shape condition no longer holds. */
  readonly exitEligibleSince: Date | null
}

export interface SetIncidentEndedAtInput {
  readonly id: AlertIncidentId
  readonly endedAt: Date
}

export interface ListIncidentsByProjectInput {
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
  readonly sourceTypes?: readonly IncidentSourceType[]
  /**
   * Restrict to incidents tied to a single source entity (e.g., a specific issue id). Combine with
   * `sourceTypes` so the same id namespace is unambiguous when future source types are added.
   */
  readonly sourceId?: string
  /** Restrict to one or more severities. Omit or pass an empty array to include all severities. */
  readonly severities?: readonly AlertSeverity[]
}

/** Keyset cursor; `endedAt` is `null` while paging the ongoing (`ended_at NULL`) block. */
export interface IncidentCursor {
  readonly endedAt: Date | null
  readonly id: AlertIncidentId
}

export interface ListIncidentsByMonitorIdInput {
  readonly monitorId: MonitorId
  readonly limit: number
  readonly cursor?: IncidentCursor
}

export interface IncidentListPage {
  readonly items: readonly Incident[]
  /** Cursor for the next page, or `null` when there are no more rows. */
  readonly nextCursor: IncidentCursor | null
  readonly hasMore: boolean
}

export interface MonitorIncidentStats {
  readonly total: number
  /** `started_at` of the first (oldest) incident — "first detected at". */
  readonly firstStartedAt: Date | null
  /** Last incident's id (ongoing-first pick) — the manual-resolve target while it's open; `null` when the monitor has no incidents. */
  readonly lastIncidentId: AlertIncidentId | null
  /** Last incident's `started_at` (ongoing-first pick); the fallback for "last detected at" when it's still open. */
  readonly lastStartedAt: Date | null
  /** Last incident's `ended_at` — "last detected at"; `null` while that incident is ongoing. */
  readonly lastEndedAt: Date | null
}

export interface IncidentRepositoryShape {
  insert(incident: Incident): Effect.Effect<void, RepositoryError, SqlClient>
  findById(id: AlertIncidentId): Effect.Effect<Incident, NotFoundError | RepositoryError, SqlClient>
  /**
   * Return the open `(source_type, source_id)` incident in the current
   * organization's RLS scope, or `null` when no open row exists. Read path
   * for the escalation check use case so it can inspect the entry snapshot
   * and dwell tracker on subsequent ticks.
   */
  findOpen(input: FindOpenIncidentInput): Effect.Effect<Incident | null, RepositoryError, SqlClient>
  /**
   * Set `ended_at` on the open `(source_type, source_id)` row in the
   * current organization's RLS scope. Returns the closed row's id, or `null`
   * when no open row was found.
   */
  closeOpen(input: CloseOpenIncidentInput): Effect.Effect<AlertIncidentId | null, RepositoryError, SqlClient>
  /**
   * Targeted write that only touches `exit_eligible_since` on the given row.
   * Used by the escalation check use case to start, hold, or clear the
   * temporal dwell that gates band-shape exits — separate from `closeOpen`
   * because the dwell can advance many times without the incident closing.
   */
  updateExitDwell(input: UpdateIncidentExitDwellInput): Effect.Effect<void, RepositoryError, SqlClient>
  /** Set `ended_at` on one incident by id (org scope) — the saved-search machines already hold the row; close events (if any) are emitted by the caller. */
  setEndedAt(input: SetIncidentEndedAtInput): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Set `ended_at` on one incident by id (org scope) only while it is still
   * open, returning the closed row or `null` when the row is missing or
   * already closed. The atomic guard lets the manual-resolve use case emit
   * `IncidentClosed` exactly once under concurrent resolves.
   */
  closeById(input: SetIncidentEndedAtInput): Effect.Effect<Incident | null, RepositoryError, SqlClient>
  /**
   * Returns every incident in the project whose lifetime overlaps the optional `[from, to]`
   * window, ordered ascending by `started_at`. Uses the
   * `(organization_id, project_id, started_at)` index. An incident overlaps the window when
   * `started_at <= to` AND (`ended_at IS NULL` OR `ended_at >= from`) — ongoing incidents
   * (null `ended_at`) overlap as long as they began on or before `to`. Each bound is
   * skipped when omitted, so passing no bounds returns every incident for the project.
   * Additional optional filters narrow by `sourceType`, `sourceId`, and `severity`.
   */
  listByProjectId(input: ListIncidentsByProjectInput): Effect.Effect<readonly Incident[], RepositoryError, SqlClient>
  /**
   * Returns every currently-open (`ended_at IS NULL`) incident matching `sourceType`,
   * ordered ascending by `started_at`. Cross-org by design — drive through the
   * admin Postgres client so RLS is bypassed. Backs the hourly escalation sweep:
   * the system needs a way to find every stuck-open signal incident
   * regardless of which org owns it, then enqueue a per-signal recheck for each.
   */
  listOpenBySourceType(sourceType: IncidentSourceType): Effect.Effect<readonly Incident[], RepositoryError, SqlClient>
  /**
   * Incidents owned by a monitor (`ended_at DESC NULLS FIRST, id DESC`, paginated).
   */
  listByMonitorId(input: ListIncidentsByMonitorIdInput): Effect.Effect<IncidentListPage, RepositoryError, SqlClient>
  statsByMonitorId(monitorId: MonitorId): Effect.Effect<MonitorIncidentStats, RepositoryError, SqlClient>
}

export class IncidentRepository extends Context.Service<IncidentRepository, IncidentRepositoryShape>()(
  "@domain/incidents/IncidentRepository",
) {}
