import type { ClickHouseClient } from "@clickhouse/client"
import {
  ChSqlClient,
  type ChSqlClientShape,
  ExternalUserId,
  type FilterSet,
  SessionId,
  OrganizationId as toOrganizationId,
  ProjectId as toProjectId,
  toRepositoryError,
} from "@domain/shared"
import type { Session, SessionListPage } from "@domain/spans"
import { SessionRepository } from "@domain/spans"
import { Effect, Layer } from "effect"
import { buildClickHouseWhere } from "../filter-builder.ts"
import { SESSION_FIELD_REGISTRY } from "../registries/session-fields.ts"

const LIST_SELECT = `
  organization_id,
  project_id,
  session_id,
  uniqExactMerge(trace_count)  AS trace_count,
  groupUniqArrayMerge(trace_ids) AS trace_ids,
  sum(span_count)              AS span_count,
  sum(error_count)             AS error_count,
  min(min_start_time)          AS start_time,
  max(max_end_time)            AS end_time,
  reinterpretAsInt64(max(max_end_time))
    - reinterpretAsInt64(min(min_start_time)) AS duration_ns,
  sum(tokens_input)            AS tokens_input,
  sum(tokens_output)           AS tokens_output,
  sum(tokens_cache_read)       AS tokens_cache_read,
  sum(tokens_cache_create)     AS tokens_cache_create,
  sum(tokens_reasoning)        AS tokens_reasoning,
  sum(tokens_total)            AS tokens_total,
  sum(cost_input_microcents)   AS cost_input_microcents,
  sum(cost_output_microcents)  AS cost_output_microcents,
  sum(cost_total_microcents)   AS cost_total_microcents,
  argMaxIfMerge(user_id)       AS user_id,
  groupUniqArrayArray(tags)    AS tags,
  maxMap(metadata)             AS metadata,
  groupUniqArrayIfMerge(models)        AS models,
  groupUniqArrayIfMerge(providers)     AS providers,
  groupUniqArrayIfMerge(service_names) AS service_names
`

type SessionListRow = {
  organization_id: string
  project_id: string
  session_id: string
  trace_count: string
  trace_ids: string[]
  span_count: string
  error_count: string
  start_time: string
  end_time: string
  duration_ns: string
  tokens_input: string
  tokens_output: string
  tokens_cache_read: string
  tokens_cache_create: string
  tokens_reasoning: string
  tokens_total: string
  cost_input_microcents: string
  cost_output_microcents: string
  cost_total_microcents: string
  user_id: string
  tags: string[]
  metadata: Record<string, string>
  models: string[]
  providers: string[]
  service_names: string[]
}

const toDomainSession = (row: SessionListRow): Session => ({
  organizationId: toOrganizationId(row.organization_id),
  projectId: toProjectId(row.project_id),
  sessionId: SessionId(row.session_id),
  traceCount: Number(row.trace_count),
  traceIds: row.trace_ids,
  spanCount: Number(row.span_count),
  errorCount: Number(row.error_count),
  startTime: new Date(row.start_time),
  endTime: new Date(row.end_time),
  durationNs: Number(row.duration_ns),
  tokensInput: Number(row.tokens_input),
  tokensOutput: Number(row.tokens_output),
  tokensCacheRead: Number(row.tokens_cache_read),
  tokensCacheCreate: Number(row.tokens_cache_create),
  tokensReasoning: Number(row.tokens_reasoning),
  tokensTotal: Number(row.tokens_total),
  costInputMicrocents: Number(row.cost_input_microcents),
  costOutputMicrocents: Number(row.cost_output_microcents),
  costTotalMicrocents: Number(row.cost_total_microcents),
  userId: ExternalUserId(row.user_id ?? ""),
  tags: row.tags,
  metadata: row.metadata ?? {},
  models: row.models,
  providers: row.providers,
  serviceNames: row.service_names,
})

interface SortColumn {
  readonly expr: string
  readonly chType: string
  readonly rowKey: keyof SessionListRow
}

const SORT_COLUMNS: Record<string, SortColumn> = {
  startTime: { expr: "start_time", chType: "DateTime64(9, 'UTC')", rowKey: "start_time" },
  duration: { expr: "duration_ns", chType: "Int64", rowKey: "duration_ns" },
  cost: { expr: "cost_total_microcents", chType: "UInt64", rowKey: "cost_total_microcents" },
  traceCount: { expr: "trace_count", chType: "UInt64", rowKey: "trace_count" },
}

function buildSessionFilterClauses(filters: FilterSet | undefined): {
  clauses: string[]
  params: Record<string, unknown>
} {
  if (!filters || Object.keys(filters).length === 0) {
    return { clauses: [], params: {} }
  }
  return buildClickHouseWhere(filters, SESSION_FIELD_REGISTRY)
}

const DEFAULT_SORT: SortColumn = SORT_COLUMNS.startTime as SortColumn

export const SessionRepositoryLive = Layer.effect(
  SessionRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    return {
      findByProjectId: ({ organizationId, projectId, options }) => {
        const sort = SORT_COLUMNS[options.sortBy ?? ""] ?? DEFAULT_SORT
        const orderDir = options.sortDirection === "asc" ? "ASC" : "DESC"
        const cmp = orderDir === "DESC" ? "<" : ">"
        const limit = options.limit ?? 50

        const { clauses: filterClauses, params: filterParams } = buildSessionFilterClauses(options.filters)

        const havingParts: string[] = [...filterClauses]
        if (options.cursor) {
          havingParts.push(
            `(${sort.expr} ${cmp} {cursorSortValue:${sort.chType}}
              OR (${sort.expr} = {cursorSortValue:${sort.chType}}
                  AND session_id ${cmp} {cursorSessionId:String}))`,
          )
        }
        const havingClause = havingParts.length > 0 ? `HAVING ${havingParts.join(" AND ")}` : ""

        return chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT ${LIST_SELECT}
                      FROM sessions
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                      GROUP BY organization_id, project_id, session_id
                      ${havingClause}
                      ORDER BY ${sort.expr} ${orderDir}, session_id ${orderDir}
                      LIMIT {limit:UInt32}`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                limit: limit + 1,
                ...filterParams,
                ...(options.cursor
                  ? {
                      cursorSortValue: options.cursor.sortValue,
                      cursorSessionId: options.cursor.sessionId,
                    }
                  : {}),
              },
              format: "JSONEachRow",
            })
            return result.json<SessionListRow>()
          })
          .pipe(
            Effect.map((rows): SessionListPage => {
              const hasMore = rows.length > limit
              const pageRows = hasMore ? rows.slice(0, limit) : rows
              const items = pageRows.map(toDomainSession)
              const last = hasMore ? pageRows[pageRows.length - 1] : undefined
              if (!last) return { items, hasMore }
              return {
                items,
                hasMore,
                nextCursor: { sortValue: String(last[sort.rowKey]), sessionId: last.session_id },
              }
            }),
            Effect.mapError((error) => toRepositoryError(error, "findByProjectId")),
          )
      },

      countByProjectId: ({ organizationId, projectId, filters }) => {
        const { clauses: filterClauses, params: filterParams } = buildSessionFilterClauses(filters)
        const havingClause = filterClauses.length > 0 ? `HAVING ${filterClauses.join(" AND ")}` : ""

        return chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT count() AS total
                      FROM (
                        SELECT session_id, ${LIST_SELECT}
                        FROM sessions
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                        GROUP BY organization_id, project_id, session_id
                        ${havingClause}
                      )`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                ...filterParams,
              },
              format: "JSONEachRow",
            })
            return result.json<{ total: string }>()
          })
          .pipe(
            Effect.map((rows) => Number(rows[0]?.total ?? 0)),
            Effect.mapError((error) => toRepositoryError(error, "countByProjectId")),
          )
      },

      distinctFilterValues: ({ organizationId, projectId, column, limit: maxValues, search }) => {
        const COLUMN_EXPRS: Record<string, string> = {
          tags: "arrayJoin(groupUniqArrayArray(tags))",
          models: "arrayJoin(groupUniqArrayIfMerge(models))",
          providers: "arrayJoin(groupUniqArrayIfMerge(providers))",
          serviceNames: "arrayJoin(groupUniqArrayIfMerge(service_names))",
        }
        const expr = COLUMN_EXPRS[column]
        if (!expr) return Effect.succeed([])

        const searchClause = search ? " AND val ILIKE {search:String}" : ""

        return chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT DISTINCT val FROM (
                        SELECT ${expr} AS val
                        FROM sessions
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                        GROUP BY organization_id, project_id, session_id
                      )
                      WHERE val != ''${searchClause}
                      ORDER BY val
                      LIMIT {limit:UInt32}`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                limit: maxValues ?? 50,
                ...(search ? { search: `%${search}%` } : {}),
              },
              format: "JSONEachRow",
            })
            return result.json<{ val: string }>()
          })
          .pipe(
            Effect.map((rows) => rows.map((r) => r.val)),
            Effect.mapError((error) => toRepositoryError(error, "distinctFilterValues")),
          )
      },
    }
  }),
)
