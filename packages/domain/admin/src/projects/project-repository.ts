import type { IssueId, NotFoundError, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { AdminProjectDetails } from "./project-details.ts"

/** Snapshot of issue counts by lifecycle state at request time. */
export interface ProjectIssueStateSnapshot {
  readonly untracked: number
  readonly tracked: number
  readonly resolved: number
}

/**
 * Lifecycle event row for one issue. Any field other than `issueId` and
 * `createdAt` may be `null`. The composer treats `ignoredAt` as a
 * resolution event (rolling Ignored into Resolved).
 *
 * `firstEvalAttachedAt` is `MIN(evaluations.created_at) WHERE issue_id = X`.
 * Per the project metrics design, `evaluations.archived_at` is ignored —
 * once an issue had any eval, it's "tracked" until it resolves.
 */
export interface ProjectIssueLifecycleEvent {
  readonly issueId: IssueId
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
export interface ProjectIssueDetails {
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
     * Issue count grouped by lifecycle state for the project. Used as
     * the anchor for the stacked-area composer — events in the window
     * walk back from this snapshot.
     */
    getCurrentIssueStateCounts(projectId: ProjectId): Effect.Effect<ProjectIssueStateSnapshot, RepositoryError>

    /**
     * Lifecycle events for issues whose `created_at`, `resolved_at`,
     * `ignored_at`, or first-evaluation `created_at` falls in
     * `[since, now]`. Issues with no event in the window aren't
     * returned — they have constant state and are reconstructed from
     * the snapshot baseline.
     */
    getIssueLifecycleEvents(
      projectId: ProjectId,
      since: Date,
    ): Effect.Effect<readonly ProjectIssueLifecycleEvent[], RepositoryError>

    /**
     * Hydrate display details (name + current lifecycle state) for the
     * given issue ids. Used by the top-issues table to render human
     * labels and authoritative state badges. Result keyed by issue id;
     * ids missing from PG are simply absent (callers fall back to the
     * id and an `untracked` default).
     */
    findIssueDetailsByIds(
      ids: readonly IssueId[],
    ): Effect.Effect<ReadonlyMap<IssueId, ProjectIssueDetails>, RepositoryError>
  }
>()("@domain/admin/AdminProjectRepository") {}
