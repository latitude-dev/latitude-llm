import type { FilterSet, ProjectId, RepositoryError, SavedSearchId, SqlClient, UserId } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { SavedSearch } from "../entities/saved-search.ts"
import type { DuplicateSavedSearchSlugError, SavedSearchNotFoundError } from "../errors.ts"

export interface SavedSearchListPage {
  readonly items: readonly SavedSearch[]
}

export interface CreateSavedSearchRepoInput {
  readonly id?: SavedSearchId
  readonly projectId: ProjectId
  readonly slug: string
  readonly name: string
  readonly query: string | null
  readonly filterSet: FilterSet
  readonly assignedUserId: UserId | null
  readonly createdByUserId: UserId
}

export interface UpdateSavedSearchRepoInput {
  readonly id: SavedSearchId
  /** Used only to surface a meaningful `projectId` on `DuplicateSavedSearchSlugError`. */
  readonly projectId: ProjectId
  readonly slug?: string
  readonly name?: string
  readonly query?: string | null
  readonly filterSet?: FilterSet
  readonly assignedUserId?: UserId | null
}

export interface ListSavedSearchesRepoInput {
  readonly projectId: ProjectId
  readonly assignedUserId?: UserId
}

export interface ExistsBySlugRepoInput {
  readonly projectId: ProjectId
  readonly slug: string
  readonly excludeId?: SavedSearchId
}

export interface SavedSearchRepositoryShape {
  create(
    args: CreateSavedSearchRepoInput,
  ): Effect.Effect<SavedSearch, DuplicateSavedSearchSlugError | RepositoryError, SqlClient>
  findById(id: SavedSearchId): Effect.Effect<SavedSearch, SavedSearchNotFoundError | RepositoryError, SqlClient>
  findBySlug(args: {
    readonly projectId: ProjectId
    readonly slug: string
  }): Effect.Effect<SavedSearch, SavedSearchNotFoundError | RepositoryError, SqlClient>
  existsBySlug(args: ExistsBySlugRepoInput): Effect.Effect<boolean, RepositoryError, SqlClient>
  listByProject(args: ListSavedSearchesRepoInput): Effect.Effect<SavedSearchListPage, RepositoryError, SqlClient>
  update(
    args: UpdateSavedSearchRepoInput,
  ): Effect.Effect<SavedSearch, SavedSearchNotFoundError | DuplicateSavedSearchSlugError | RepositoryError, SqlClient>
  softDelete(id: SavedSearchId): Effect.Effect<void, SavedSearchNotFoundError | RepositoryError, SqlClient>
}

export class SavedSearchRepository extends ServiceMap.Service<SavedSearchRepository, SavedSearchRepositoryShape>()(
  "@domain/saved-searches/SavedSearchRepository",
) {}
