import type { OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { AgentScoreSnapshot } from "../entities/agent-score-snapshot.ts"

export interface AgentScoreSnapshotHistoryScope {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** Inclusive UTC date bounds, `YYYY-MM-DD`. */
  readonly from: string
  readonly to: string
}

export interface AgentScoreSnapshotRepositoryShape {
  /**
   * Writes the day's snapshot, or does nothing if the day already has one.
   *
   * A no-op rather than an update, because a stored score is a record of what was published on a
   * date and a rerun is an operational event rather than a correction. Returns whether it wrote, so
   * a job can tell a first run from a replay instead of guessing.
   */
  insertIfAbsent(snapshot: AgentScoreSnapshot): Effect.Effect<boolean, RepositoryError, SqlClient>

  findByDate(scope: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly date: string
  }): Effect.Effect<AgentScoreSnapshot | null, RepositoryError, SqlClient>

  /** Oldest first, so a trend chart plots without re-sorting. */
  listHistory(
    scope: AgentScoreSnapshotHistoryScope,
  ): Effect.Effect<readonly AgentScoreSnapshot[], RepositoryError, SqlClient>
}

export class AgentScoreSnapshotRepository extends Context.Service<
  AgentScoreSnapshotRepository,
  AgentScoreSnapshotRepositoryShape
>()("@domain/agent-score/AgentScoreSnapshotRepository") {}
