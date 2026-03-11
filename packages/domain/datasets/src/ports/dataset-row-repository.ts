import type { DatasetId, DatasetRowId, OrganizationId, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { DatasetRow, RowNotFoundError } from "../entities/dataset-row.ts"

export interface DatasetRowRepositoryShape {
  insertBatch(args: {
    readonly organizationId: OrganizationId
    readonly datasetId: DatasetId
    readonly version: number
    readonly rows: readonly {
      readonly id: DatasetRowId
      readonly input: Record<string, unknown>
      readonly output?: Record<string, unknown>
      readonly metadata?: Record<string, unknown>
    }[]
  }): Effect.Effect<readonly DatasetRowId[], RepositoryError>

  list(args: {
    readonly organizationId: OrganizationId
    readonly datasetId: DatasetId
    readonly version?: number
    readonly search?: string
    readonly limit?: number
    readonly offset?: number
  }): Effect.Effect<{ readonly rows: readonly DatasetRow[]; readonly total: number }, RepositoryError>

  findById(args: {
    readonly organizationId: OrganizationId
    readonly datasetId: DatasetId
    readonly rowId: DatasetRowId
    readonly version?: number
  }): Effect.Effect<DatasetRow, RowNotFoundError | RepositoryError>
}

export class DatasetRowRepository extends ServiceMap.Service<DatasetRowRepository, DatasetRowRepositoryShape>()(
  "@domain/datasets/DatasetRowRepository",
) {}
