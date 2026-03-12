import type { ClickHouseClient } from "@clickhouse/client"
import type { DatasetRow } from "@domain/datasets"
import { DatasetRowRepository, RowNotFoundError } from "@domain/datasets"
import { ChSqlClient, type ChSqlClientShape, DatasetId, DatasetRowId } from "@domain/shared"
import { safeParseJson, safeStringifyJson } from "@repo/utils"
import { Effect, Layer } from "effect"

const serializeField = (value: unknown): string => {
  if (value !== null && typeof value === "object" && Object.keys(value as Record<string, unknown>).length === 0) {
    return ""
  }
  return safeStringifyJson(value)
}

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
  input: safeParseJson(row.input, { fallback: "string" }),
  output: safeParseJson(row.output, { fallback: "string" }),
  metadata: safeParseJson(row.metadata, { fallback: "string" }),
  createdAt: new Date(row.created_at),
  version: Number(row.latest_xact_id),
})

const buildSearchClause = (search: string | undefined) =>
  search
    ? "AND (positionCaseInsensitive(input, {search:String}) > 0 OR positionCaseInsensitive(output, {search:String}) > 0)"
    : ""

const buildVersionClause = (version: number | undefined) =>
  version !== undefined ? "AND xact_id <= {version:UInt64}" : ""

const INSERT_BATCH_SIZE = 500

export const DatasetRowRepositoryLive = Layer.effect(
  DatasetRowRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    return {
      insertBatch: (args) =>
        chSqlClient.query(async (client) => {
          const values = args.rows.map((row) => ({
            organization_id: args.organizationId,
            dataset_id: args.datasetId,
            row_id: row.id,
            xact_id: args.version,
            input: serializeField(row.input),
            output: serializeField(row.output),
            metadata: serializeField(row.metadata),
          }))

          for (let i = 0; i < values.length; i += INSERT_BATCH_SIZE) {
            const batch = values.slice(i, i + INSERT_BATCH_SIZE)
            await client.insert({
              table: "dataset_rows",
              values: batch,
              format: "JSONEachRow",
            })
          }

          return args.rows.map((r) => r.id)
        }),

      list: (args) =>
        chSqlClient.query(async (client) => {
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

          const [dataResult, countResult] = await Promise.all([
            client
              .query({
                query: dataQuery,
                query_params: params,
                format: "JSONEachRow",
              })
              .then((r) => r.json<DatasetRowCH>()),
            client
              .query({
                query: countQuery,
                query_params: params,
                format: "JSONEachRow",
              })
              .then((r) => r.json<{ total: string }>()),
          ])

          return {
            rows: dataResult.map((row) => toDomainRow(row, args.datasetId)),
            total: Number(countResult[0]?.total ?? 0),
          } as const
        }),

      findById: (args) =>
        Effect.gen(function* () {
          const result = yield* chSqlClient.query(async (client) => {
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

            const rows = await client
              .query({ query, query_params: params, format: "JSONEachRow" })
              .then((r) => r.json<DatasetRowCH>())

            return rows.length > 0 ? toDomainRow(rows[0], args.datasetId) : null
          })

          if (!result) {
            return yield* new RowNotFoundError({ rowId: args.rowId })
          }

          return result
        }),
      updateRow: (args) =>
        chSqlClient.query(async (client) => {
          await client.insert({
            table: "dataset_rows",
            values: [
              {
                organization_id: args.organizationId,
                dataset_id: args.datasetId,
                row_id: args.rowId,
                xact_id: args.version,
                input: serializeField(args.input),
                output: serializeField(args.output),
                metadata: serializeField(args.metadata),
              },
            ],
            format: "JSONEachRow",
          })
        }),
      deleteBatch: (args) =>
        chSqlClient.query(async (client) => {
          if (args.rowIds.length === 0) return

          const values = args.rowIds.map((rowId) => ({
            organization_id: args.organizationId,
            dataset_id: args.datasetId,
            row_id: rowId,
            xact_id: args.version,
            input: "",
            output: "",
            metadata: "",
            _object_delete: true,
          }))

          for (let i = 0; i < values.length; i += INSERT_BATCH_SIZE) {
            const batch = values.slice(i, i + INSERT_BATCH_SIZE)
            await client.insert({
              table: "dataset_rows",
              values: batch,
              format: "JSONEachRow",
            })
          }
        }),
    }
  }),
)
