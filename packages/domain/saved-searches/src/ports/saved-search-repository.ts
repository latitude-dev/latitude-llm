import type { FilterSet, ProjectId, RepositoryError, SavedSearchId, SqlClient, UserId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { SavedSearch } from "../entities/saved-search.ts"
import type { DuplicateSavedSearchSlugError, SavedSearchNotFoundError } from "../errors.ts"

export interface SavedSearchListPage {
  readonly items: readonly SavedSearch[]
}

/**
 * Lightweight, org-wide saved-search projection for the Command Palette. Carries the owning
 * project's slug/name so a cross-project result can be displayed and navigated to without a
 * second lookup.
 */
export interface SavedSearchSearchResult {
  readonly id: SavedSearchId
  readonly projectId: ProjectId
  readonly projectSlug: string
  readonly projectName: string
  readonly slug: string
  readonly name: string
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

export interface CountBySlugRepoInput {
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
  countBySlug(args: CountBySlugRepoInput): Effect.Effect<number, RepositoryError, SqlClient>
  listByProject(args: ListSavedSearchesRepoInput): Effect.Effect<SavedSearchListPage, RepositoryError, SqlClient>
  /**
   * Org-wide name search across every project in the organization (RLS-scoped to the caller's
   * org). Powers the Command Palette. `searchQuery` is a case-insensitive substring match on the
   * saved-search name, ordered by match quality (exact > prefix > substring) then most recent; omit
   * it to list the most recent. Soft-deleted saved searches and saved
   * searches in soft-deleted projects are excluded. When `preferProjectId` is set, that project's
   * saved searches are ranked first (the palette passes the current project so local results lead).
   */
  searchOrgWide(args: {
    readonly searchQuery?: string
    readonly preferProjectId?: ProjectId
    readonly limit: number
  }): Effect.Effect<readonly SavedSearchSearchResult[], RepositoryError, SqlClient>
  update(
    args: UpdateSavedSearchRepoInput,
  ): Effect.Effect<SavedSearch, SavedSearchNotFoundError | DuplicateSavedSearchSlugError | RepositoryError, SqlClient>
  softDelete(id: SavedSearchId): Effect.Effect<void, SavedSearchNotFoundError | RepositoryError, SqlClient>
}

export class SavedSearchRepository extends Context.Service<SavedSearchRepository, SavedSearchRepositoryShape>()(
  "@domain/saved-searches/SavedSearchRepository",
) {}
