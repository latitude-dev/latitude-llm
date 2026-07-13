import type { CustomBehaviorId, NotFoundError, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { CustomBehavior } from "../entities/custom-behavior.ts"

export interface FindCustomBehaviorBySlugInput {
  readonly projectId: ProjectId
  readonly slug: string
}

/** Postgres-backed CRUD for custom behavior definitions. Org scope comes from the RLS context. */
export interface CustomBehaviorRepositoryShape {
  findById(id: CustomBehaviorId): Effect.Effect<CustomBehavior, NotFoundError | RepositoryError, SqlClient>
  findBySlug(input: FindCustomBehaviorBySlugInput): Effect.Effect<CustomBehavior | null, RepositoryError, SqlClient>
  listByProject(input: {
    readonly projectId: ProjectId
  }): Effect.Effect<readonly CustomBehavior[], RepositoryError, SqlClient>
  /** Count for the per-project cap (LAT-746 Q1 = flat 10) enforced in the create use-case. */
  countByProject(input: { readonly projectId: ProjectId }): Effect.Effect<number, RepositoryError, SqlClient>
  /** Existing rows using `slug` in the project; pairs with `generateSlug`'s `count` callback. */
  countBySlug(input: FindCustomBehaviorBySlugInput): Effect.Effect<number, RepositoryError, SqlClient>
  save(behavior: CustomBehavior): Effect.Effect<void, RepositoryError, SqlClient>
  delete(id: CustomBehaviorId): Effect.Effect<void, RepositoryError, SqlClient>
}

export class CustomBehaviorRepository extends Context.Service<
  CustomBehaviorRepository,
  CustomBehaviorRepositoryShape
>()("@domain/taxonomy/CustomBehaviorRepository") {}
