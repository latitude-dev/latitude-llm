import type { MonitorId, NotFoundError, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
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
}

export class MonitorRepository extends Context.Service<MonitorRepository, MonitorRepositoryShape>()(
  "@domain/monitors/MonitorRepository",
) {}
