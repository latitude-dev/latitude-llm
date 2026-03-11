import type { ClickHouseClient } from "@clickhouse/client"
import type { DatasetRow } from "@domain/datasets"
import { RowNotFoundError } from "@domain/datasets"
import { DatasetId, DatasetRowId, toRepositoryError } from "@domain/shared"
import { safeParseJson, safeStringifyJson } from "@repo/utils"
import { Effect } from "effect"
import { insertJsonEachRow, queryClickhouse } from "../sql.ts"

type DatasetRowCH = {
  row_id: string
  input: string
  output: string
  metadata: string
  created_at: string
  latest_xact_id: string
}

const toDomainRow = (row: DatasetRowCH, datasetId: string): DatasetRow => ({
  rowId: DatasetRowId(row.row_id),
  datasetId: DatasetId(datasetId),
  input: safeParseJson(row.input),
  output: safeParseJson(row.output),
  metadata: safeParseJson(row.metadata),
  createdAt: new Date(row.created_at),
  version: Number(row.latest_xact_id),
})

// Searches raw JSON strings — may match keys/syntax, not just values
const buildSearchClause = (search: string | undefined) =>
  search
    ? "AND (positionCaseInsensitive(input, {search:String}) > 0 OR positionCaseInsensitive(output, {search:String}) > 0)"
    : ""

const buildVersionClause = (version: number | undefined) =>
  version !== undefined ? "AND xact_id <= {version:UInt64}" : ""

const INSERT_BATCH_SIZE = 500

export const createDatasetRowClickHouseRepository = (client: ClickHouseClient) => ({
  insertBatch: (args: {
    organizationId: string
    datasetId: string
    version: number
    rows: readonly {
      readonly id: DatasetRowId
      readonly input: Record<string, unknown>
      readonly output?: Record<string, unknown>
      readonly metadata?: Record<string, unknown>
    }[]
  }) =>
    Effect.gen(function* () {
      const values = args.rows.map((row) => ({
        organization_id: args.organizationId,
        dataset_id: args.datasetId,
        row_id: row.id,
        xact_id: args.version,
        input: safeStringifyJson(row.input),
        output: safeStringifyJson(row.output ?? {}),
        metadata: safeStringifyJson(row.metadata ?? {}),
      }))

      for (let i = 0; i < values.length; i += INSERT_BATCH_SIZE) {
        const batch = values.slice(i, i + INSERT_BATCH_SIZE)
        yield* insertJsonEachRow(client, "dataset_rows", batch).pipe(
          Effect.mapError((e) => toRepositoryError(e, "insertBatch")),
        )
      }

      return args.rows.map((r) => r.id)
    }),

  list: (args: {
    organizationId: string
    datasetId: string
    version?: number
    search?: string
    limit?: number
    offset?: number
  }) =>
    Effect.gen(function* () {
      const limit = args.limit ?? 50
      const offset = args.offset ?? 0
      const params: Record<string, unknown> = {
        organizationId: args.organizationId,
        datasetId: args.datasetId,
        limit,
        offset,
      }

      if (args.version !== undefined) params.version = args.version
      if (args.search) params.search = args.search

      const versionClause = buildVersionClause(args.version)
      const searchClause = buildSearchClause(args.search)

      const dataQuery = `
        SELECT
          row_id,
          argMax(input, xact_id) AS input,
          argMax(output, xact_id) AS output,
          argMax(metadata, xact_id) AS metadata,
          min(created_at) AS created_at,
          max(xact_id) AS latest_xact_id
        FROM dataset_rows
        WHERE organization_id = {organizationId:String}
          AND dataset_id = {datasetId:String}
          ${versionClause}
        GROUP BY row_id
        HAVING argMax(_object_delete, xact_id) = false
          ${searchClause}
        ORDER BY created_at DESC
        LIMIT {limit:UInt32} OFFSET {offset:UInt32}
      `

      const countQuery = `
        SELECT count() AS total FROM (
          SELECT
            row_id,
            argMax(input, xact_id) AS input,
            argMax(output, xact_id) AS output
          FROM dataset_rows
          WHERE organization_id = {organizationId:String}
            AND dataset_id = {datasetId:String}
            ${versionClause}
          GROUP BY row_id
          HAVING argMax(_object_delete, xact_id) = false
            ${searchClause}
        )
      `

      const [rows, countResult] = yield* Effect.all([
        queryClickhouse<DatasetRowCH>(client, dataQuery, params).pipe(
          Effect.mapError((e) => toRepositoryError(e, "list")),
        ),
        queryClickhouse<{ total: string }>(client, countQuery, params).pipe(
          Effect.mapError((e) => toRepositoryError(e, "list:count")),
        ),
      ])

      return {
        rows: rows.map((row) => toDomainRow(row, args.datasetId)),
        total: Number(countResult[0]?.total ?? 0),
      } as const
    }),

  findById: (args: {
    organizationId: string
    datasetId: string
    rowId: string
    version?: number
  }) =>
    Effect.gen(function* () {
      const params: Record<string, unknown> = {
        organizationId: args.organizationId,
        datasetId: args.datasetId,
        rowId: args.rowId,
      }

      if (args.version !== undefined) params.version = args.version

      const versionClause = buildVersionClause(args.version)

      const query = `
        SELECT
          row_id,
          argMax(input, xact_id) AS input,
          argMax(output, xact_id) AS output,
          argMax(metadata, xact_id) AS metadata,
          min(created_at) AS created_at,
          max(xact_id) AS latest_xact_id
        FROM dataset_rows
        WHERE organization_id = {organizationId:String}
          AND dataset_id = {datasetId:String}
          AND row_id = {rowId:String}
          ${versionClause}
        GROUP BY row_id
        HAVING argMax(_object_delete, xact_id) = false
        LIMIT 1
      `

      const rows = yield* queryClickhouse<DatasetRowCH>(client, query, params).pipe(
        Effect.mapError((e) => toRepositoryError(e, "findById")),
      )

      if (rows.length === 0) {
        return yield* new RowNotFoundError({ rowId: args.rowId })
      }

      return toDomainRow(rows[0] ?? [], args.datasetId)
    }),
})
