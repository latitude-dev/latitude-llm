import type { DatasetId, DatasetVersionId, ProjectId, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { Dataset, DatasetNotFoundError, DatasetVersion } from "../entities/dataset.ts"

export class DatasetRepository extends ServiceMap.Service<
  DatasetRepository,
  {
    create(args: {
      readonly projectId: ProjectId
      readonly name: string
      readonly description?: string
      readonly fileKey?: string
    }): Effect.Effect<Dataset, RepositoryError>

    findById(id: DatasetId): Effect.Effect<Dataset, DatasetNotFoundError | RepositoryError>

    listByProject(args: {
      readonly projectId: ProjectId
      readonly limit?: number
      readonly offset?: number
    }): Effect.Effect<{ readonly datasets: readonly Dataset[]; readonly total: number }, RepositoryError>

    existsByNameInProject(args: {
      readonly projectId: ProjectId
      readonly name: string
      readonly excludeDatasetId?: DatasetId
    }): Effect.Effect<boolean, RepositoryError>

    updateName(args: {
      readonly id: DatasetId
      readonly name: string
    }): Effect.Effect<Dataset, DatasetNotFoundError | RepositoryError>

    updateFileKey(args: {
      readonly id: DatasetId
      readonly fileKey: string
    }): Effect.Effect<Dataset, DatasetNotFoundError | RepositoryError>

    softDelete(id: DatasetId): Effect.Effect<void, DatasetNotFoundError | RepositoryError>

    incrementVersion(args: {
      readonly id: DatasetId
      readonly rowsInserted?: number
      readonly rowsUpdated?: number
      readonly rowsDeleted?: number
      readonly source?: string
      readonly actorId?: string
    }): Effect.Effect<DatasetVersion, DatasetNotFoundError | RepositoryError>

    decrementVersion(args: {
      readonly id: DatasetId
      readonly versionId: DatasetVersionId
    }): Effect.Effect<void, DatasetNotFoundError | RepositoryError>

    resolveVersion(args: {
      readonly datasetId: DatasetId
      readonly versionId: DatasetVersionId
    }): Effect.Effect<number, DatasetNotFoundError | RepositoryError>
  }
>()("@domain/datasets/DatasetRepository") {}
