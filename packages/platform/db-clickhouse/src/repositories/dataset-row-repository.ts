import type { ClickHouseClient } from "@clickhouse/client"
import type { DatasetRow } from "@domain/datasets"
import { DatasetRowRepository, RowNotFoundError } from "@domain/datasets"
import { ChSqlClient, type ChSqlClientShape, DatasetId, DatasetRowId, TraceId } from "@domain/shared"
import { parseCHDate, safeParseJson, safeStringifyJson } from "@repo/utils"
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
  createdAt: parseCHDate(row.created_at),
  version: Number(row.latest_xact_id),
})

const buildSearchClause = (search: string | undefined) =>
  search
    ? "AND (positionCaseInsensitive(input, {search:String}) > 0 OR positionCaseInsensitive(output, {search:String}) > 0)"
    : ""

const buildVersionClause = (version: number | undefined) =>
  version !== undefined ? "AND xact_id <= {version:UInt64}" : ""

type RowSortDirection = "asc" | "desc"

const buildCreatedAtSortFragments = (sortDirection: RowSortDirection) => {
  const desc = sortDirection === "desc"
  const orderDir = desc ? "DESC" : "ASC"
  const keysetOp = desc ? "<" : ">"
  return {
    orderSql: `ORDER BY created_at ${orderDir}, row_id ${orderDir}`,
    keysetSql: `AND (
      created_at ${keysetOp} toDateTime64({cursorCreatedAt:String}, 3, 'UTC')
      OR (
        created_at = toDateTime64({cursorCreatedAt:String}, 3, 'UTC')
        AND row_id ${keysetOp} {cursorRowId:String}
      )
    )`,
  }
}

/**
 * List query used by both list (with count) and listPage. Uses offset when no cursor.
 */
const buildListDataQueryOffset = (versionClause: string, searchClause: string, sortDirection: RowSortDirection) => {
  const { orderSql } = buildCreatedAtSortFragments(sortDirection)
  return `
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
  ${orderSql}
  LIMIT {limit:UInt32} OFFSET {offset:UInt32}
`
}

/**
 * Keyset: same shape as traces `listByProjectId` (trace-repository.ts) — cursor goes in HAVING
 * using SELECT aliases (`created_at`), not repeated aggregates like `min(created_at)` (that nested
 * aggregate error). ClickHouse allows aliases from SELECT in HAVING.
 */
const buildListDataQueryKeyset = (versionClause: string, searchClause: string, sortDirection: RowSortDirection) => {
  const { orderSql, keysetSql } = buildCreatedAtSortFragments(sortDirection)
  return `
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
    ${keysetSql}
  ${orderSql}
  LIMIT {limit:UInt32}
`
}

const buildListCountQuery = (versionClause: string, searchClause: string) => `
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

const INSERT_BATCH_SIZE = 500

export const DatasetRowRepositoryLive = Layer.effect(
  DatasetRowRepository,
  Effect.gen(function* () {
    yield* ChSqlClient

    return {
      findExistingTraceIds: (args) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient.query(async (client, organizationId) => {
          if (args.traceIds.length === 0) return new Set<TraceId>()

          const result = await client
            .query({
              query: `
                SELECT DISTINCT JSONExtractString(
                  argMax(metadata, xact_id), 'traceId'
                ) AS trace_id
                FROM dataset_rows
                WHERE organization_id = {organizationId:String}
                  AND dataset_id = {datasetId:String}
                GROUP BY row_id
                HAVING argMax(_object_delete, xact_id) = false
                  AND trace_id IN ({traceIds:Array(String)})
              `,
              query_params: {
                organizationId: organizationId as string,
                datasetId: args.datasetId as string,
                traceIds: Array.from(args.traceIds) as string[],
              },
              format: "JSONEachRow",
            })
            .then((r) => r.json<{ trace_id: string }>())

          return new Set(result.map((r) => TraceId(r.trace_id)))
        })
        }),

      // TODO(repositories): rename insertBatch -> saveBatch so repository write
      // verbs converge on save/saveBatch instead of insert/insertBatch.
      insertBatch: (args) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient.query(async (client, organizationId) => {
          const values = args.rows.map((row) => ({
            organization_id: organizationId,
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
        })
        }),

      list: (args) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient.query(async (client, organizationId) => {
          const limit = args.limit ?? 50
          const sortDirection: RowSortDirection = args.sortDirection ?? "desc"
          const versionClause = buildVersionClause(args.version)
          const searchClause = buildSearchClause(args.search)

          if (args.cursor) {
            const params: Record<string, unknown> = {
              organizationId,
              datasetId: args.datasetId,
              limit: limit + 1,
              cursorCreatedAt: args.cursor.createdAt,
              cursorRowId: args.cursor.rowId,
            }
            if (args.version !== undefined) params.version = args.version
            if (args.search) params.search = args.search

            const dataQuery = buildListDataQueryKeyset(versionClause, searchClause, sortDirection)
            const dataResult = await client
              .query({
                query: dataQuery,
                query_params: params,
                format: "JSONEachRow",
              })
              .then((r) => r.json<DatasetRowCH>())

            const hasMore = dataResult.length > limit
            const sliced = hasMore ? dataResult.slice(0, limit) : dataResult
            const rows = sliced.map((row) => toDomainRow(row, args.datasetId))
            const lastCh = sliced[sliced.length - 1]
            const nextCursor =
              hasMore && lastCh
                ? ({
                    createdAt: lastCh.created_at,
                    rowId: DatasetRowId(lastCh.row_id),
                  } as const)
                : undefined

            return nextCursor ? { rows, nextCursor } : { rows }
          }

          const offset = args.offset ?? 0
          const params: Record<string, unknown> = {
            organizationId,
            datasetId: args.datasetId,
            limit: limit + 1,
            offset,
          }
          if (args.version !== undefined) params.version = args.version
          if (args.search) params.search = args.search

          const dataQuery = buildListDataQueryOffset(versionClause, searchClause, sortDirection)
          const countQuery = buildListCountQuery(versionClause, searchClause)

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

          const hasMore = dataResult.length > limit
          const sliced = hasMore ? dataResult.slice(0, limit) : dataResult
          const rows = sliced.map((row) => toDomainRow(row, args.datasetId))
          const totalCount = Number(countResult[0]?.total ?? 0)
          const lastCh = sliced[sliced.length - 1]
          const nextCursor =
            hasMore && lastCh
              ? ({
                  createdAt: lastCh.created_at,
                  rowId: DatasetRowId(lastCh.row_id),
                } as const)
              : undefined

          return nextCursor ? { rows, total: totalCount, nextCursor } : { rows, total: totalCount }
        })
        }),

      count: (args) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient.query(async (client, organizationId) => {
          const params: Record<string, unknown> = {
            organizationId,
            datasetId: args.datasetId,
          }

          if (args.version !== undefined) params.version = args.version
          if (args.search) params.search = args.search

          const versionClause = buildVersionClause(args.version)
          const searchClause = buildSearchClause(args.search)
          const countQuery = buildListCountQuery(versionClause, searchClause)

          const countResult = await client
            .query({
              query: countQuery,
              query_params: params,
              format: "JSONEachRow",
            })
            .then((r) => r.json<{ total: string }>())

          return Number(countResult[0]?.total ?? 0)
        })
        }),

      listPage: (args) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient.query(async (client, organizationId) => {
          const params: Record<string, unknown> = {
            organizationId,
            datasetId: args.datasetId,
            limit: args.limit,
            offset: args.offset,
          }

          if (args.version !== undefined) params.version = args.version
          if (args.search) params.search = args.search

          const versionClause = buildVersionClause(args.version)
          const searchClause = buildSearchClause(args.search)
          const dataQuery = buildListDataQueryOffset(versionClause, searchClause, "desc")

          const dataResult = await client
            .query({
              query: dataQuery,
              query_params: params,
              format: "JSONEachRow",
            })
            .then((r) => r.json<DatasetRowCH>())

          return dataResult.map((row) => toDomainRow(row, args.datasetId))
        })
        }),

      findById: (args) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const result = yield* chSqlClient.query(async (client, organizationId) => {
            const params: Record<string, unknown> = {
              organizationId,
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
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient.query(async (client, organizationId) => {
          await client.insert({
            table: "dataset_rows",
            values: [
              {
                organization_id: organizationId,
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
        })
        }),
      deleteBatch: (args) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient.query(async (client, organizationId) => {
          if (args.rowIds.length === 0) return

          const values = args.rowIds.map((rowId) => ({
            organization_id: organizationId,
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
        })
        }),
      deleteAll: (args) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient.query(async (client, organizationId) => {
          const excluded = args.excludedRowIds ?? []
          const excludeClause = excluded.length > 0 ? "AND row_id NOT IN ({excludedRowIds:Array(String)})" : ""

          const params: Record<string, unknown> = {
            organizationId: organizationId as string,
            datasetId: args.datasetId as string,
          }
          if (excluded.length > 0) {
            params.excludedRowIds = Array.from(excluded) as string[]
          }

          const activeRows = await client
            .query({
              query: `
                SELECT row_id
                FROM dataset_rows
                WHERE organization_id = {organizationId:String}
                  AND dataset_id = {datasetId:String}
                GROUP BY row_id
                HAVING argMax(_object_delete, xact_id) = false
                  ${excludeClause}
              `,
              query_params: params,
              format: "JSONEachRow",
            })
            .then((r) => r.json<{ row_id: string }>())

          if (activeRows.length === 0) return 0

          const tombstones = activeRows.map((row) => ({
            organization_id: organizationId,
            dataset_id: args.datasetId,
            row_id: row.row_id,
            xact_id: args.version,
            input: "",
            output: "",
            metadata: "",
            _object_delete: true,
          }))

          for (let i = 0; i < tombstones.length; i += INSERT_BATCH_SIZE) {
            const batch = tombstones.slice(i, i + INSERT_BATCH_SIZE)
            await client.insert({
              table: "dataset_rows",
              values: batch,
              format: "JSONEachRow",
            })
          }

          return activeRows.length
        })
        }),
    }
  }),
)
