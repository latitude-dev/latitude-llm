import type { FacetId, NotFoundError, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { TaxonomyFacet } from "../entities/facet.ts"

export interface FindFacetBySlugInput {
  readonly projectId: ProjectId
  readonly slug: string
}

/** Postgres-backed CRUD for facet definitions. Org scope comes from the RLS context. */
export interface FacetRepositoryShape {
  findById(id: FacetId): Effect.Effect<TaxonomyFacet, NotFoundError | RepositoryError, SqlClient>
  /** Resolve a project's facet by slug — the dedupe/reuse lookup a preset pick uses to avoid a second row. */
  findBySlug(input: FindFacetBySlugInput): Effect.Effect<TaxonomyFacet | null, RepositoryError, SqlClient>
  listByProject(input: {
    readonly projectId: ProjectId
  }): Effect.Effect<readonly TaxonomyFacet[], RepositoryError, SqlClient>
  /** Count for the per-project cap (`MAX_FACETS_PER_PROJECT`) enforced in the create use-case. */
  countByProject(input: { readonly projectId: ProjectId }): Effect.Effect<number, RepositoryError, SqlClient>
  /** Existing rows using `slug` in the project; pairs with `generateSlug`'s `count` callback for custom facets. */
  countBySlug(input: FindFacetBySlugInput): Effect.Effect<number, RepositoryError, SqlClient>
  save(facet: TaxonomyFacet): Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Stamp `last_gardened_at` when a scoped garden run starts. Kept off `save`
   * (and the entity) so the scheduling column stays repository-internal: `save`
   * never overwrites it, and the cron eligibility query reads it directly.
   */
  markGardened(input: {
    readonly id: FacetId
    readonly gardenedAt: Date
  }): Effect.Effect<void, RepositoryError, SqlClient>
  delete(id: FacetId): Effect.Effect<void, RepositoryError, SqlClient>
}

export class FacetRepository extends Context.Service<FacetRepository, FacetRepositoryShape>()(
  "@domain/taxonomy/FacetRepository",
) {}
