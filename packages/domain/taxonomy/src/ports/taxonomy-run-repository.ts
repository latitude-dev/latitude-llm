import type { NotFoundError, ProjectId, RepositoryError, SqlClient, TaxonomyRunId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { TaxonomyDimension } from "../entities/dimension.ts"
import type { TaxonomyRun } from "../entities/lineage.ts"

export interface TaxonomyRunRepositoryShape {
  findById(id: TaxonomyRunId): Effect.Effect<TaxonomyRun, NotFoundError | RepositoryError, SqlClient>
  /** Most recent run per project, regardless of status. */
  findLatestByProject(input: {
    readonly projectId: ProjectId
    readonly dimension: TaxonomyDimension
  }): Effect.Effect<TaxonomyRun | null, RepositoryError, SqlClient>
  /**
   * Currently-running rows for the project. The gardening eligibility gate
   * inspects these to detect concurrent or stale runs.
   */
  listRunning(input: {
    readonly projectId: ProjectId
    readonly dimension: TaxonomyDimension
  }): Effect.Effect<readonly TaxonomyRun[], RepositoryError, SqlClient>
  listRecentCompleted(input: {
    readonly projectId: ProjectId
    readonly dimension: TaxonomyDimension
    readonly limit: number
  }): Effect.Effect<readonly TaxonomyRun[], RepositoryError, SqlClient>
  insert(run: TaxonomyRun): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Partial update covering the fields that change as gardening progresses
   * (counters, status, completedAt, error).
   */
  save(run: TaxonomyRun): Effect.Effect<void, RepositoryError, SqlClient>
}

export class TaxonomyRunRepository extends Context.Service<TaxonomyRunRepository, TaxonomyRunRepositoryShape>()(
  "@domain/taxonomy/TaxonomyRunRepository",
) {}
