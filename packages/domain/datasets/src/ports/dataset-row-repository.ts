import type { ChSqlClient, DatasetId, DatasetRowId, RepositoryError, SortDirection, TraceId } from "@domain/shared"
import { type Effect, Context } from "effect"
import type { DatasetRow, InsertRowFieldValue, RowFieldValue } from "../entities/dataset-row.ts"
import type { RowNotFoundError } from "../errors.ts"

export interface DatasetRowRepositoryShape {
  findExistingTraceIds(args: {
    readonly datasetId: DatasetId
    readonly traceIds: readonly TraceId[]
  }): Effect.Effect<ReadonlySet<TraceId>, RepositoryError, ChSqlClient>
  // TODO(repositories): rename insertBatch -> saveBatch so repository write
  // verbs converge on save/saveBatch instead of insert/insertBatch.
  insertBatch(args: {
    readonly datasetId: DatasetId
    readonly version: number
    readonly rows: readonly {
      readonly id: DatasetRowId
      readonly input: InsertRowFieldValue
      readonly output?: InsertRowFieldValue
      readonly metadata?: InsertRowFieldValue
    }[]
  }): Effect.Effect<readonly DatasetRowId[], RepositoryError, ChSqlClient>

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
    RepositoryError,
    ChSqlClient
  >

  /**
   * Returns total row count without fetching rows. Use when only the count is needed
   * (e.g. download threshold check) to avoid loading row data.
   */
  count(args: {
    readonly datasetId: DatasetId
    readonly version?: number
    readonly search?: string
  }): Effect.Effect<number, RepositoryError, ChSqlClient>

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
  }): Effect.Effect<readonly DatasetRow[], RepositoryError, ChSqlClient>

  findById(args: {
    readonly datasetId: DatasetId
    readonly rowId: DatasetRowId
    readonly version?: number
  }): Effect.Effect<DatasetRow, RowNotFoundError | RepositoryError, ChSqlClient>

  updateRow(args: {
    readonly datasetId: DatasetId
    readonly rowId: DatasetRowId
    readonly version: number
    readonly input: RowFieldValue
    readonly output: RowFieldValue
    readonly metadata: RowFieldValue
  }): Effect.Effect<void, RepositoryError, ChSqlClient>

  deleteBatch(args: {
    readonly datasetId: DatasetId
    readonly rowIds: readonly DatasetRowId[]
    readonly version: number
  }): Effect.Effect<void, RepositoryError, ChSqlClient>

  deleteAll(args: {
    readonly datasetId: DatasetId
    readonly version: number
    readonly excludedRowIds?: readonly DatasetRowId[]
  }): Effect.Effect<number, RepositoryError, ChSqlClient>
}

export class DatasetRowRepository extends Context.Service<DatasetRowRepository, DatasetRowRepositoryShape>()(
  "@domain/datasets/DatasetRowRepository",
) {}
