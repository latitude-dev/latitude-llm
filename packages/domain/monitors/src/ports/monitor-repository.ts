import type {
  AlertIncidentCondition,
  AlertIncidentKind,
  AlertIncidentSourceType,
  AlertSeverity,
  MonitorAlertId,
  MonitorId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SqlClient,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Monitor, MonitorAlert } from "../entities/monitor.ts"

/** An (org, project) pair holding at least one active saved-search alert — the sweep's fan-out unit. */
export interface ProjectWithActiveSavedSearchAlerts {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}

export interface CascadeSourceDeletionResult {
  readonly deletedAlertCount: number
  readonly deletedMonitorCount: number
}

export interface ListMonitorsRepositoryInput {
  readonly projectId: ProjectId
  readonly limit: number
  readonly offset: number
  /** Case-insensitive substring match on `name`; caller normalises. Omit to list all. */
  readonly searchQuery?: string
}

export interface MonitorLastIncident {
  readonly startedAt: Date
  readonly endedAt: Date | null
}

export interface MonitorListPage {
  readonly items: readonly Monitor[]
  /** Keyed by `MonitorId`; omits monitors with no incidents. Joins through `monitor_alerts` incl. soft-deleted so history stays attributable. */
  readonly lastIncidentByMonitorId: ReadonlyMap<string, MonitorLastIncident>
  readonly totalCount: number
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

/**
 * Lightweight, org-wide monitor projection for the Command Palette. Carries the owning project's
 * slug/name (for display + navigation) plus the `system`/`mutedAt` status the palette shows in a
 * result's subtitle. Skips the alert join the full {@link Monitor} read does — search doesn't need
 * alerts.
 */
export interface MonitorSearchResult {
  readonly id: MonitorId
  readonly projectId: ProjectId
  readonly projectSlug: string
  readonly projectName: string
  readonly slug: string
  readonly name: string
  readonly system: boolean
  readonly mutedAt: Date | null
}

/** The earliest-created live, unmuted monitor watching a given saved search — backs the saved-search dropdown's "View monitor" deep-link. */
export interface SavedSearchMonitorSlug {
  readonly savedSearchId: string
  readonly monitorSlug: string
}

export interface MonitorRepositoryShape {
  findById(id: MonitorId): Effect.Effect<Monitor, NotFoundError | RepositoryError, SqlClient>
  /** Point-lookup by `(projectId, slug)` over non-deleted rows. */
  findBySlug(input: {
    readonly projectId: ProjectId
    readonly slug: string
  }): Effect.Effect<Monitor, NotFoundError | RepositoryError, SqlClient>
  /** Non-deleted monitors for a project, ordered most-recent incident first (no-incident last), tiebroken by `created_at DESC, id`. */
  list(input: ListMonitorsRepositoryInput): Effect.Effect<MonitorListPage, RepositoryError, SqlClient>
  /**
   * Org-wide name search across every project in the organization (RLS-scoped to the caller's
   * org). Powers the Command Palette. `searchQuery` is a case-insensitive substring match on the
   * monitor name, ordered by match quality (exact > prefix > substring), then system monitors, then
   * most recent; omit it to list system monitors first, then the most recent. Soft-deleted monitors and monitors in
   * soft-deleted projects are excluded. When `preferProjectId` is set, that project's monitors are
   * ranked first (the palette passes the current project so local results lead).
   */
  searchOrgWide(input: {
    readonly searchQuery?: string
    readonly preferProjectId?: ProjectId
    readonly limit: number
  }): Effect.Effect<readonly MonitorSearchResult[], RepositoryError, SqlClient>
  /**
   * Insert each monitor (with its alerts) only when no live row already holds
   * its `(projectId, slug)`. Atomic and idempotent — returns just the monitors
   * that were newly inserted, so a re-run on an already-provisioned project
   * returns `[]`.
   */
  provisionSystemMonitors(monitors: readonly Monitor[]): Effect.Effect<readonly Monitor[], RepositoryError, SqlClient>
  /**
   * Re-provision system monitors to the given definitions (backoffice reset).
   * Upserts each by `(projectId, slug)` — updates name/description on an
   * existing system monitor (preserving its `mutedAt`), inserts when missing,
   * and resets its alerts to the definition (soft-deleting the old alerts so
   * incident history stays joinable, then inserting fresh). Skips a slug held
   * by a non-system monitor. Filters by the entity's `projectId`, so it is safe
   * to run from the admin/`"system"` (RLS-off) context. Returns the monitors
   * that were reset.
   */
  resetSystemMonitors(monitors: readonly Monitor[]): Effect.Effect<readonly Monitor[], RepositoryError, SqlClient>
  /** Insert a new monitor and its alerts atomically. The caller pre-resolves the slug. */
  create(monitor: Monitor): Effect.Effect<void, RepositoryError, SqlClient>
  /** Insert a single new alert (org resolved from the client). Used to add an alert to a live monitor. */
  insertAlert(alert: MonitorAlert): Effect.Effect<void, RepositoryError, SqlClient>
  /** Soft-delete a single live alert + silently close its open incidents (no event). Fails `NotFoundError` if it isn't a live alert. */
  softDeleteAlert(alertId: MonitorAlertId): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
  /** Set or clear `mutedAt` on a live monitor. Fails `NotFoundError` if it doesn't exist. */
  setMuted(input: {
    readonly id: MonitorId
    readonly mutedAt: Date | null
  }): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
  /** Soft-delete a live monitor, cascade `deletedAt` to its live alerts (firing stops; history stays joinable), and silently close those alerts' open incidents. */
  softDelete(id: MonitorId): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
  /** Update a live monitor's name/slug/description. Caller resolves the slug. */
  updateMetadata(input: {
    readonly id: MonitorId
    readonly name: string
    readonly slug: string
    readonly description: string
  }): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
  /** Update a live alert's `kind` / `source.id` / `condition` / `severity` in place (source type stays fixed by kind). */
  updateAlert(input: {
    readonly alertId: MonitorAlertId
    readonly kind: AlertIncidentKind
    readonly sourceId: string | null
    readonly condition: AlertIncidentCondition | null
    readonly severity: AlertSeverity
  }): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
  /**
   * Active alerts a source event fires: same `kind`/`sourceType`, `source.id`
   * null ("all") or `= sourceId`. Project-scoped via `monitors`; excludes
   * soft-deleted alerts + deleted monitors.
   */
  listActiveAlertsForSourceEvent(input: {
    readonly projectId: ProjectId
    readonly kind: AlertIncidentKind
    readonly sourceType: AlertIncidentSourceType
    readonly sourceId: string
  }): Effect.Effect<readonly MonitorAlert[], RepositoryError, SqlClient>
  /** `FOR UPDATE` lock on a `monitor_alerts` row inside the caller's transaction — serialises the one-time-threshold read-then-insert against retries. No-ops if the row is gone. */
  lockAlertForUpdate(alertId: MonitorAlertId): Effect.Effect<void, RepositoryError, SqlClient>
  /** Active saved-search alerts in a project (live alert + monitor). Org-scoped — the firing orchestrator resolves + evaluates each. */
  listActiveSavedSearchAlerts(projectId: ProjectId): Effect.Effect<readonly MonitorAlert[], RepositoryError, SqlClient>
  /**
   * For every saved search watched by a live, unmuted monitor in the project, the slug of the
   * earliest-created such monitor (`DISTINCT ON (source_id)`, ordered by monitor `createdAt`/`id`).
   * Batched — one call covers all the project's saved searches.
   */
  listSavedSearchMonitorSlugs(
    projectId: ProjectId,
  ): Effect.Effect<readonly SavedSearchMonitorSlug[], RepositoryError, SqlClient>
  /** Distinct `(org, project)` pairs with ≥1 active saved-search alert. **Cross-org** (admin client) — backs the 5-minute sweep's per-project fan-out. */
  listProjectsWithActiveSavedSearchAlerts(): Effect.Effect<
    readonly ProjectWithActiveSavedSearchAlerts[],
    RepositoryError,
    SqlClient
  >
  /**
   * Source-deletion cascade: soft-delete every live alert watching
   * `(sourceType, sourceId)` in the current org, silently close those alerts'
   * open incidents, then soft-delete any monitor left with no active alerts (so
   * firing stops while incident history stays joinable through the soft-deleted
   * alert). One transaction.
   */
  cascadeSourceDeletion(input: {
    readonly sourceType: AlertIncidentSourceType
    readonly sourceId: string
  }): Effect.Effect<CascadeSourceDeletionResult, RepositoryError, SqlClient>
  /** Count live monitors in a project holding `slug`, excluding `excludeId` — backs slug regeneration. */
  countActiveBySlug(input: {
    readonly projectId: ProjectId
    readonly slug: string
    readonly excludeId: MonitorId
  }): Effect.Effect<number, RepositoryError, SqlClient>
}

export class MonitorRepository extends Context.Service<MonitorRepository, MonitorRepositoryShape>()(
  "@domain/monitors/MonitorRepository",
) {}
