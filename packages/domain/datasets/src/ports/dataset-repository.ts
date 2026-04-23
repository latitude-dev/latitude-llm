import type { DatasetId, DatasetVersionId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
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

export class DatasetRepository extends ServiceMap.Service<
  DatasetRepository,
  {
    create(args: {
      readonly id?: DatasetId
      readonly projectId: ProjectId
      readonly name: string
      readonly description?: string
      readonly fileKey?: string
    }): Effect.Effect<Dataset, RepositoryError, SqlClient>

    findById(id: DatasetId): Effect.Effect<Dataset, DatasetNotFoundError | RepositoryError, SqlClient>

    listByProject(args: {
      readonly projectId: ProjectId
      readonly options?: DatasetListOptions
    }): Effect.Effect<DatasetListPage, RepositoryError, SqlClient>

    existsByNameInProject(args: {
      readonly projectId: ProjectId
      readonly name: string
      readonly excludeDatasetId?: DatasetId
    }): Effect.Effect<boolean, RepositoryError, SqlClient>

    updateName(args: {
      readonly id: DatasetId
      readonly name: string
    }): Effect.Effect<Dataset, DatasetNotFoundError | RepositoryError, SqlClient>

    updateDetails(args: {
      readonly id: DatasetId
      readonly name: string
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
