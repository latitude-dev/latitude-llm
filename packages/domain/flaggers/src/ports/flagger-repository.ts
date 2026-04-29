import type { ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Flagger } from "../entities/flagger.ts"
import type { FlaggerSlug } from "../flagger-strategies/types.ts"

export interface ListFlaggersByProjectInput {
  readonly projectId: ProjectId
}

export interface FindFlaggerByProjectAndSlugInput {
  readonly projectId: ProjectId
  readonly slug: FlaggerSlug
}

export interface SaveFlaggersForProjectInput {
  readonly projectId: ProjectId
  readonly slugs: readonly FlaggerSlug[]
}

export interface UpdateFlaggerInput {
  readonly projectId: ProjectId
  readonly slug: FlaggerSlug
  readonly enabled: boolean
}

export interface FlaggerRepositoryShape {
  /** All flagger rows for a project, in slug order. */
  listByProject(input: ListFlaggersByProjectInput): Effect.Effect<readonly Flagger[], RepositoryError, SqlClient>
  findByProjectAndSlug(
    input: FindFlaggerByProjectAndSlugInput,
  ): Effect.Effect<Flagger | null, RepositoryError, SqlClient>
  /**
   * Insert one row per `(projectId, slug)` (org id comes from the bound
   * `SqlClient`) with default `enabled = true`, `sampling =
   * FLAGGER_DEFAULT_SAMPLING`. Conflicts on the unique
   * `(organization_id, project_id, slug)` index are ignored — provisioning
   * runs once per project on `ProjectCreated`, so conflicts only happen on
   * retries / re-seed. Returns the rows that were newly inserted (empty on a
   * second run).
   */
  saveManyForProject(input: SaveFlaggersForProjectInput): Effect.Effect<readonly Flagger[], RepositoryError, SqlClient>
  update(input: UpdateFlaggerInput): Effect.Effect<Flagger | null, RepositoryError, SqlClient>
}

export class FlaggerRepository extends ServiceMap.Service<FlaggerRepository, FlaggerRepositoryShape>()(
  "@domain/flaggers/FlaggerRepository",
) {}
