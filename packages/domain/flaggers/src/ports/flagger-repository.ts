import type { ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
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
  readonly enabled?: boolean
  readonly sampling?: number
}

export interface UpdateFlaggerEnabledForProjectInput {
  readonly projectId: ProjectId
  readonly enabledSlugs: readonly FlaggerSlug[]
  readonly slugs: readonly FlaggerSlug[]
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
  /**
   * Sets `enabled` for all `slugs` in one project in a single database update:
   * slugs included in `enabledSlugs` become enabled, the rest become disabled.
   * Returns only rows whose enabled state changed.
   */
  updateEnabledForProject(
    input: UpdateFlaggerEnabledForProjectInput,
  ): Effect.Effect<readonly Flagger[], RepositoryError, SqlClient>
  update(input: UpdateFlaggerInput): Effect.Effect<Flagger | null, RepositoryError, SqlClient>

  /**
   * Applies a traffic-derived sampling rate, leaving any rate a person set alone.
   *
   * Separate from `update` because it is not an edit: the daily sweep recomputes what these readers
   * have to run at for their dimension to be measurable at all, and a project that tuned its own
   * rate has made a decision the sweep is not entitled to overwrite. Returns how many rows it
   * actually changed, so a job can report what it did rather than what it attempted.
   */
  applyDerivedSampling(input: {
    readonly projectId: ProjectId
    readonly rates: readonly { readonly slug: FlaggerSlug; readonly sampling: number }[]
  }): Effect.Effect<number, RepositoryError, SqlClient>
}

export class FlaggerRepository extends Context.Service<FlaggerRepository, FlaggerRepositoryShape>()(
  "@domain/flaggers/FlaggerRepository",
) {}
