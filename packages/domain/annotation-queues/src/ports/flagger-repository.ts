import type { ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Flagger } from "../entities/flagger.ts"

export interface ListFlaggersByProjectInput {
  readonly projectId: ProjectId
}

export interface FindFlaggerByProjectAndSlugInput {
  readonly projectId: ProjectId
  readonly slug: string
}

export interface ProvisionFlaggersForProjectInput {
  readonly organizationId: string
  readonly projectId: ProjectId
  readonly slugs: readonly string[]
}

export interface UpdateFlaggerInput {
  readonly projectId: ProjectId
  readonly slug: string
  readonly enabled: boolean
}

export interface FlaggerRepositoryShape {
  /** All flagger rows for a project, in slug order. */
  listByProject(input: ListFlaggersByProjectInput): Effect.Effect<readonly Flagger[], RepositoryError, SqlClient>
  findByProjectAndSlug(
    input: FindFlaggerByProjectAndSlugInput,
  ): Effect.Effect<Flagger | null, RepositoryError, SqlClient>
  /**
   * Idempotently insert one row per `(organizationId, projectId, slug)` with default
   * `enabled = true`, `sampling = FLAGGER_DEFAULT_SAMPLING`. Conflicts on the unique
   * `(organization_id, project_id, slug)` index are ignored. Returns the resulting
   * rows for the requested slugs (existing + newly inserted).
   */
  provisionForProject(
    input: ProvisionFlaggersForProjectInput,
  ): Effect.Effect<readonly Flagger[], RepositoryError, SqlClient>
  update(input: UpdateFlaggerInput): Effect.Effect<Flagger | null, RepositoryError, SqlClient>
}

export class FlaggerRepository extends ServiceMap.Service<FlaggerRepository, FlaggerRepositoryShape>()(
  "@domain/annotation-queues/FlaggerRepository",
) {}
