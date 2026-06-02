import type {
  AlertIncidentCondition,
  AlertSeverity,
  MonitorAlertId,
  MonitorId,
  NotFoundError,
  ProjectId,
  RepositoryError,
  SqlClient,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Monitor } from "../entities/monitor.ts"

export interface ListMonitorsRepositoryInput {
  readonly projectId: ProjectId
  readonly limit: number
  readonly offset: number
  /** Case-insensitive substring match on `name`; caller normalises. Omit to list all. */
  readonly searchQuery?: string
}

export interface MonitorListPage {
  readonly items: readonly Monitor[]
  readonly totalCount: number
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

export interface MonitorRepositoryShape {
  findById(id: MonitorId): Effect.Effect<Monitor, NotFoundError | RepositoryError, SqlClient>
  /** Point-lookup by `(projectId, slug)` over non-deleted rows. */
  findBySlug(input: {
    readonly projectId: ProjectId
    readonly slug: string
  }): Effect.Effect<Monitor, NotFoundError | RepositoryError, SqlClient>
  /** Non-deleted monitors for a project, system monitors first then `created_at DESC`. */
  list(input: ListMonitorsRepositoryInput): Effect.Effect<MonitorListPage, RepositoryError, SqlClient>
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
  /** Set or clear `mutedAt` on a live monitor. Fails `NotFoundError` if it doesn't exist. */
  setMuted(input: {
    readonly id: MonitorId
    readonly mutedAt: Date | null
  }): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
  /** Soft-delete a live monitor and cascade `deletedAt` to its live alerts (so firing stops; incident history stays joinable). */
  softDelete(id: MonitorId): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
  /** Update a live monitor's name/slug/description. Caller resolves the slug. */
  updateMetadata(input: {
    readonly id: MonitorId
    readonly name: string
    readonly slug: string
    readonly description: string
  }): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
  /** Update a live alert's `source.id` / `condition` / `severity` in place (kind + source type are fixed). */
  updateAlert(input: {
    readonly alertId: MonitorAlertId
    readonly sourceId: string | null
    readonly condition: AlertIncidentCondition | null
    readonly severity: AlertSeverity
  }): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
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
