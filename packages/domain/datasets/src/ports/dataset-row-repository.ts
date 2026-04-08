import type { DatasetId, DatasetRowId, RepositoryError, SortDirection, TraceId } from "@domain/shared"
import { type Effect } from "effect"
import { EffectService } from "@repo/effect-service"
import type { DatasetRow, InsertRowFieldValue, RowFieldValue } from "../entities/dataset-row.ts"
import type { RowNotFoundError } from "../errors.ts"

export interface DatasetRowRepositoryShape {
  findExistingTraceIds(args: {
    readonly datasetId: DatasetId
    readonly traceIds: readonly TraceId[]
  }): Effect.Effect<ReadonlySet<TraceId>, RepositoryError>
  insertBatch(args: {
    readonly datasetId: DatasetId
    readonly version: number
    readonly rows: readonly {
      readonly id: DatasetRowId
      readonly input: InsertRowFieldValue
      readonly output?: InsertRowFieldValue
      readonly metadata?: InsertRowFieldValue
    }[]
  }): Effect.Effect<readonly DatasetRowId[], RepositoryError>

  /** Cursor for keyset pagination: (createdAt, rowId) of the last row from previous page. */
  list(args: {
    readonly datasetId: DatasetId
    readonly version?: number
    readonly search?: string
    readonly sortDirection?: SortDirection
    readonly limit?: number
    readonly offset?: number
    readonly cursor?: { readonly createdAt: string; readonly rowId: DatasetRowId }
  }): Effect.Effect<
    {
      readonly rows: readonly DatasetRow[]
      readonly total?: number
      readonly nextCursor?: { readonly createdAt: string; readonly rowId: DatasetRowId }
    },
    RepositoryError
  >

  /**
   * Returns total row count without fetching rows. Use when only the count is needed
   * (e.g. download threshold check) to avoid loading row data.
   */
  count(args: {
    readonly datasetId: DatasetId
    readonly version?: number
    readonly search?: string
  }): Effect.Effect<number, RepositoryError>

  /**
   * Returns one page of rows without a total count. Use for export/iteration to avoid
   * repeated count queries and to process in bounded memory.
   */
  listPage(args: {
    readonly datasetId: DatasetId
    readonly version?: number
    readonly search?: string
    readonly limit: number
    readonly offset: number
  }): Effect.Effect<readonly DatasetRow[], RepositoryError>

  findById(args: {
    readonly datasetId: DatasetId
    readonly rowId: DatasetRowId
    readonly version?: number
  }): Effect.Effect<DatasetRow, RowNotFoundError | RepositoryError>

  updateRow(args: {
    readonly datasetId: DatasetId
    readonly rowId: DatasetRowId
    readonly version: number
    readonly input: RowFieldValue
    readonly output: RowFieldValue
    readonly metadata: RowFieldValue
  }): Effect.Effect<void, RepositoryError>

  deleteBatch(args: {
    readonly datasetId: DatasetId
    readonly rowIds: readonly DatasetRowId[]
    readonly version: number
  }): Effect.Effect<void, RepositoryError>

  deleteAll(args: {
    readonly datasetId: DatasetId
    readonly version: number
    readonly excludedRowIds?: readonly DatasetRowId[]
  }): Effect.Effect<number, RepositoryError>
}

export class DatasetRowRepository extends EffectService<DatasetRowRepository, DatasetRowRepositoryShape>()(
  "@domain/datasets/DatasetRowRepository",
) {}
