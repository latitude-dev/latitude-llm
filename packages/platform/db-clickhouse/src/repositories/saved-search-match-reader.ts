import type { ClickHouseClient } from "@clickhouse/client"
import {
  SavedSearchMatchReader,
  type SavedSearchMatchReaderShape,
  type SavedSearchMatchWindowInput,
} from "@domain/monitors"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { parseSearchQuery } from "@domain/spans"
import { Effect, Layer } from "effect"
import { isActiveSearch, planSearch } from "./search-plan.ts"
import { buildTraceFilterClauses, LIST_SELECT } from "./trace-repository.ts"

/** ClickHouse `DateTime64` params take a space-separated, zone-naive string (UTC). */
const toClickHouseDateTime64 = (value: Date): string => value.toISOString().replace("T", " ").replace("Z", "")

/**
 * The grouped per-trace subquery the count + first-match queries wrap. The window
 * is a `HAVING` on the aggregated `start_time` (`min(min_start_time)`), not a
 * `WHERE` — same as the trace list/count — combined with the search's filters + query.
 */
const buildInnerQuery = (
  input: SavedSearchMatchWindowInput,
): Effect.Effect<{ readonly sql: string; readonly params: Record<string, unknown> }> =>
  Effect.gen(function* () {
    const { havingClauses, whereClauses, params: filterParams } = buildTraceFilterClauses(input.target.filterSet)
    const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

    const parsed = input.target.query ? parseSearchQuery(input.target.query) : undefined
    let searchCondition = ""
    let searchParams: Record<string, unknown> = {}
    if (parsed && isActiveSearch(parsed)) {
      const plan = yield* planSearch(parsed)
      searchCondition = `AND trace_id IN (SELECT trace_id FROM (${plan.subquery}))`
      searchParams = plan.params
    }

    const having = [
      "start_time >= toDateTime64({windowFrom:String}, 9, 'UTC')",
      "start_time < toDateTime64({windowTo:String}, 9, 'UTC')",
      ...havingClauses,
    ].join(" AND ")

    return {
      sql: `SELECT ${LIST_SELECT}
            FROM traces
            WHERE organization_id = {organizationId:String}
              AND project_id = {projectId:String}
              ${extraWhere}
              ${searchCondition}
            GROUP BY organization_id, project_id, trace_id
            HAVING ${having}`,
      params: {
        organizationId: input.organizationId as string,
        projectId: input.projectId as string,
        windowFrom: toClickHouseDateTime64(input.from),
        windowTo: toClickHouseDateTime64(input.to),
        ...filterParams,
        ...searchParams,
      },
    }
  })

const make = (): SavedSearchMatchReaderShape => ({
  countMatches: (input) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      const inner = yield* buildInnerQuery(input)
      return yield* chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT count() AS total FROM (${inner.sql})`,
            query_params: inner.params,
            format: "JSONEachRow",
          })
          return result.json<{ total: string }>()
        })
        .pipe(
          Effect.map((rows) => Number(rows[0]?.total ?? 0)),
          Effect.mapError((error) => toRepositoryError(error, "SavedSearchMatchReader.countMatches")),
        )
    }),
  firstMatchAt: (input) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      const inner = yield* buildInnerQuery(input)
      return yield* chSqlClient
        .query(async (client) => {
          const result = await client.query({
            // `count()` guards the empty case — `min()` over zero rows returns the
            // epoch, not NULL, so we'd otherwise report a bogus 1970 first match.
            query: `SELECT toString(min(start_time)) AS first_at, count() AS matches FROM (${inner.sql})`,
            query_params: inner.params,
            format: "JSONEachRow",
          })
          return result.json<{ first_at: string | null; matches: string }>()
        })
        .pipe(
          Effect.map((rows) => {
            const row = rows[0]
            if (!row || Number(row.matches) === 0 || !row.first_at) return null
            const parsed = new Date(row.first_at.includes(" ") ? `${row.first_at.replace(" ", "T")}Z` : row.first_at)
            return Number.isNaN(parsed.getTime()) ? null : parsed
          }),
          Effect.mapError((error) => toRepositoryError(error, "SavedSearchMatchReader.firstMatchAt")),
        )
    }),
})

export const SavedSearchMatchReaderLive = Layer.succeed(SavedSearchMatchReader, make())
