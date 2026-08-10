import type { NotFoundError, OrganizationId, ProjectId, RepositoryError, SignalId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { AdminProjectDetails } from "./project-details.ts"

/** Flat identity for a project plus its parent organisation, for link rendering. */
export interface AdminProjectSummary {
  readonly id: ProjectId
  readonly name: string
  readonly slug: string
  readonly organizationId: OrganizationId
  readonly organizationName: string
  readonly organizationSlug: string
}

/** Snapshot of issue counts by lifecycle state at request time. */
export interface ProjectSignalStateSnapshot {
  readonly untracked: number
  readonly tracked: number
  readonly resolved: number
}

/**
 * Lifecycle event row for one issue. Any field other than `signalId` and
 * `createdAt` may be `null`. The composer treats `ignoredAt` as a
 * resolution event (rolling Ignored into Resolved).
 *
 * `firstEvalAttachedAt` is `MIN(evaluations.created_at) WHERE issue_id = X`.
 * Per the project metrics design, `evaluations.archived_at` is ignored —
 * once an issue had any eval, it's "tracked" until it resolves.
 */
export interface ProjectSignalLifecycleEvent {
  readonly signalId: SignalId
  readonly createdAt: Date
  readonly firstEvalAttachedAt: Date | null
  readonly resolvedAt: Date | null
  readonly ignoredAt: Date | null
}

/**
 * Display details for a top-issues table row. The `state` field is
 * computed against current PG state (resolved/ignored stamps + presence
 * of any non-deleted evaluation), independent of the in-window
 * lifecycle events — an issue that became `tracked` long before the
 * window opened still reports `tracked` here.
 */
export interface ProjectSignalDetails {
  readonly name: string
  readonly state: "untracked" | "tracked" | "resolved"
}

/**
 * Cross-organization project-detail port for the backoffice.
 *
 * WARNING: adapters MUST run under an admin (RLS-bypassing) DB
 * connection — see `AdminProjectRepositoryLive` in
 * `@platform/db-postgres`. Only wired into handlers that have passed
 * `adminMiddleware` in `apps/web`.
 */
export class AdminProjectRepository extends Context.Service<
  AdminProjectRepository,
  {
    /**
     * Fetch a project + its parent organisation by id.
     *
     * Fails with `NotFoundError` when no project exists. Soft-deleted
     * projects are excluded — the backoffice deliberately does not
     * surface them in v1, matching the search-results filter.
     */
    findById(projectId: ProjectId): Effect.Effect<AdminProjectDetails, NotFoundError | RepositoryError>

    /**
     * Signal count grouped by lifecycle state for the project. Used as
     * the anchor for the stacked-area composer — events in the window
     * walk back from this snapshot.
     */
    getCurrentSignalStateCounts(projectId: ProjectId): Effect.Effect<ProjectSignalStateSnapshot, RepositoryError>

    /**
     * Lifecycle events for issues whose `created_at`, `resolved_at`,
     * `ignored_at`, or first-evaluation `created_at` falls in
     * `[since, now]`. Signals with no event in the window aren't
     * returned — they have constant state and are reconstructed from
     * the snapshot baseline.
     */
    getSignalLifecycleEvents(
      projectId: ProjectId,
      since: Date,
    ): Effect.Effect<readonly ProjectSignalLifecycleEvent[], RepositoryError>

    /**
     * Hydrate display details (name + current lifecycle state) for the
     * given issue ids. Used by the top-issues table to render human
     * labels and authoritative state badges. Result keyed by issue id;
     * ids missing from PG are simply absent (callers fall back to the
     * id and an `untracked` default).
     */
    findSignalDetailsByIds(
      ids: readonly SignalId[],
    ): Effect.Effect<ReadonlyMap<SignalId, ProjectSignalDetails>, RepositoryError>

    /**
     * Names, slugs and parent organisation for the given project ids, so views that start from a
     * ClickHouse aggregate can render links instead of opaque ids.
     *
     * Ids missing from the map are hard-deleted projects; callers render the bare id rather than
     * dropping the row, because the usage it accounts for was still real. Soft-deleted projects
     * *are* returned here, unlike `findById` — a project deleted after its spans were ingested is
     * exactly the case a staff reader needs named.
     */
    findManySummariesByIds(
      ids: readonly ProjectId[],
    ): Effect.Effect<ReadonlyMap<ProjectId, AdminProjectSummary>, RepositoryError>
  }
>()("@domain/admin/AdminProjectRepository") {}
