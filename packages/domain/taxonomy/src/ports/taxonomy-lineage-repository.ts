import type { ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { TaxonomyClusterLineage, TaxonomyLineageTransitionType } from "../entities/lineage.ts"

export interface TaxonomyLineageRepositoryShape {
  /** Append a batch of transition rows in one statement. */
  appendMany(rows: readonly TaxonomyClusterLineage[]): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Most recent transitions for a project, newest first. Powers the
   * "Activity" panel on the read side.
   */
  listRecent(input: {
    readonly projectId: ProjectId
    readonly limit: number
  }): Effect.Effect<readonly TaxonomyClusterLineage[], RepositoryError, SqlClient>
  listRecentByTransitionTypes(input: {
    readonly projectId: ProjectId
    readonly transitionTypes: readonly TaxonomyLineageTransitionType[]
    readonly limit: number
  }): Effect.Effect<readonly TaxonomyClusterLineage[], RepositoryError, SqlClient>
}

export class TaxonomyLineageRepository extends Context.Service<
  TaxonomyLineageRepository,
  TaxonomyLineageRepositoryShape
>()("@domain/taxonomy/TaxonomyLineageRepository") {}
