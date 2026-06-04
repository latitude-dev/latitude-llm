import type { DatasetId, DatasetVersionId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Dataset, DatasetVersion } from "../entities/dataset.ts"
import type { DatasetNotFoundError } from "../errors.ts"

export const DATASET_LIST_SORT_COLUMNS = ["name", "updatedAt"] as const
export type DatasetListSortBy = (typeof DATASET_LIST_SORT_COLUMNS)[number]

export interface DatasetListCursor {
  readonly sortValue: string
  readonly id: string
}

export interface DatasetListOptions {
  readonly limit?: number
  readonly cursor?: DatasetListCursor
  readonly sortBy?: DatasetListSortBy
  readonly sortDirection?: "asc" | "desc"
}

export interface DatasetListPage {
  readonly datasets: readonly Dataset[]
  readonly hasMore: boolean
  readonly nextCursor?: DatasetListCursor
}

/**
 * Lightweight, org-wide dataset projection for the Command Palette search. Carries the owning
 * project's slug/name so a cross-project result can be displayed and navigated to without a
 * second lookup. Not the full {@link Dataset} — search only needs identity + display fields.
 */
export interface DatasetSearchResult {
  readonly id: DatasetId
  readonly projectId: ProjectId
  readonly projectSlug: string
  readonly projectName: string
  readonly slug: string
  readonly name: string
}

export class DatasetRepository extends Context.Service<
  DatasetRepository,
  {
    create(args: {
      readonly id?: DatasetId
      readonly projectId: ProjectId
      readonly slug: string
      readonly name: string
      readonly description?: string
      readonly fileKey?: string
    }): Effect.Effect<Dataset, RepositoryError, SqlClient>

    findById(id: DatasetId): Effect.Effect<Dataset, DatasetNotFoundError | RepositoryError, SqlClient>

    /**
     * Point-lookup by `(projectId, slug)`. Slugs are unique within a project, so this is the
     * natural read path for slug-keyed API endpoints. Soft-deleted datasets are not returned.
     */
    findBySlug(args: {
      readonly projectId: ProjectId
      readonly slug: string
    }): Effect.Effect<Dataset, DatasetNotFoundError | RepositoryError, SqlClient>

    listByProject(args: {
      readonly projectId: ProjectId
      readonly options?: DatasetListOptions
    }): Effect.Effect<DatasetListPage, RepositoryError, SqlClient>

    /**
     * Org-wide name search across every project in the organization (RLS-scoped to the caller's
     * org). Powers the Command Palette. `searchQuery` is a case-insensitive substring match on the
     * dataset name, ordered by match quality (exact > prefix > substring) then most recent; omit it
     * to list the most recent datasets. Soft-deleted datasets and datasets in
     * soft-deleted projects are excluded. When `preferProjectId` is set, datasets in that project
     * are ranked ahead of the rest (the palette passes the current project so local results lead).
     */
    searchOrgWide(args: {
      readonly searchQuery?: string
      readonly preferProjectId?: ProjectId
      readonly limit: number
    }): Effect.Effect<readonly DatasetSearchResult[], RepositoryError, SqlClient>

    existsByNameInProject(args: {
      readonly projectId: ProjectId
      readonly name: string
      readonly excludeDatasetId?: DatasetId
    }): Effect.Effect<boolean, RepositoryError, SqlClient>

    countBySlug(args: {
      readonly projectId: ProjectId
      readonly slug: string
      readonly excludeDatasetId?: DatasetId
    }): Effect.Effect<number, RepositoryError, SqlClient>

    updateName(args: {
      readonly id: DatasetId
      readonly name: string
      readonly slug: string
    }): Effect.Effect<Dataset, DatasetNotFoundError | RepositoryError, SqlClient>

    updateDetails(args: {
      readonly id: DatasetId
      readonly name: string
      readonly slug: string
      readonly description: string | null
    }): Effect.Effect<Dataset, DatasetNotFoundError | RepositoryError, SqlClient>

    updateFileKey(args: {
      readonly id: DatasetId
      readonly fileKey: string
    }): Effect.Effect<Dataset, DatasetNotFoundError | RepositoryError, SqlClient>

    softDelete(id: DatasetId): Effect.Effect<void, DatasetNotFoundError | RepositoryError, SqlClient>

    incrementVersion(args: {
      readonly id: DatasetId
      readonly rowsInserted?: number
      readonly rowsUpdated?: number
      readonly rowsDeleted?: number
      readonly source?: string
      readonly actorId?: string
    }): Effect.Effect<DatasetVersion, DatasetNotFoundError | RepositoryError, SqlClient>

    decrementVersion(args: {
      readonly id: DatasetId
      readonly versionId: DatasetVersionId
    }): Effect.Effect<void, DatasetNotFoundError | RepositoryError, SqlClient>

    resolveVersion(args: {
      readonly datasetId: DatasetId
      readonly versionId: DatasetVersionId
    }): Effect.Effect<number, DatasetNotFoundError | RepositoryError, SqlClient>
  }
>()("@domain/datasets/DatasetRepository") {}
