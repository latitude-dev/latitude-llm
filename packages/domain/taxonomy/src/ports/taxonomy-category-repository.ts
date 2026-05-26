import type { NotFoundError, ProjectId, RepositoryError, SqlClient, TaxonomyCategoryId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { TaxonomyCategory } from "../entities/category.ts"

export interface BestCategoryMatch {
  readonly category: TaxonomyCategory
  readonly cosine: number
}

export interface TaxonomyCategoryRepositoryShape {
  findById(id: TaxonomyCategoryId): Effect.Effect<TaxonomyCategory, NotFoundError | RepositoryError, SqlClient>
  listByProject(input: {
    readonly projectId: ProjectId
    readonly state?: TaxonomyCategory["state"]
  }): Effect.Effect<readonly TaxonomyCategory[], RepositoryError, SqlClient>
  /**
   * Find the active category whose centroid is most similar to the supplied
   * vector. Used by the hierarchy rebuild step to continue an existing
   * category id when its rebuilt centroid is close enough to a prior one.
   */
  findBestMatchByVector(input: {
    readonly projectId: ProjectId
    readonly queryVector: readonly number[]
  }): Effect.Effect<BestCategoryMatch | null, RepositoryError, SqlClient>
  save(category: TaxonomyCategory): Effect.Effect<void, RepositoryError, SqlClient>
  markDeprecated(input: {
    readonly categoryId: TaxonomyCategoryId
    readonly timestamp: Date
  }): Effect.Effect<void, RepositoryError, SqlClient>
}

export class TaxonomyCategoryRepository extends Context.Service<
  TaxonomyCategoryRepository,
  TaxonomyCategoryRepositoryShape
>()("@domain/taxonomy/TaxonomyCategoryRepository") {}
