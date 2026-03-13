import type { DatasetId, DatasetRowId, OrganizationId, RepositoryError, TraceId } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { DatasetRow, RowFieldValue, RowNotFoundError } from "../entities/dataset-row.ts"

export interface DatasetRowRepositoryShape {
  findExistingTraceIds(args: {
    readonly organizationId: OrganizationId
    readonly datasetId: DatasetId
    readonly traceIds: readonly TraceId[]
  }): Effect.Effect<ReadonlySet<TraceId>, RepositoryError>
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

  updateRow(args: {
    readonly organizationId: OrganizationId
    readonly datasetId: DatasetId
    readonly rowId: DatasetRowId
    readonly version: number
    readonly input: RowFieldValue
    readonly output: RowFieldValue
    readonly metadata: RowFieldValue
  }): Effect.Effect<void, RepositoryError>

  deleteBatch(args: {
    readonly organizationId: OrganizationId
    readonly datasetId: DatasetId
    readonly rowIds: readonly DatasetRowId[]
    readonly version: number
  }): Effect.Effect<void, RepositoryError>
}

export class DatasetRowRepository extends ServiceMap.Service<DatasetRowRepository, DatasetRowRepositoryShape>()(
  "@domain/datasets/DatasetRowRepository",
) {}
