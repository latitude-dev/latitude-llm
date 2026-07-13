import type { ClickHouseClient } from "@clickhouse/client"
import {
  ChSqlClient,
  type ChSqlClientShape,
  ExternalUserId,
  isNotFoundError,
  NotFoundError,
  toRepositoryError,
} from "@domain/shared"
import type {
  ProjectUserSummary,
  UserActivitySeries,
  UserAnalyticsRepositoryShape,
  UserProfile,
  UserSortField,
  UsersOverview,
  UserUsageDimension,
} from "@domain/spans"
import { UserAnalyticsRepository } from "@domain/spans"
import { formatCHDate, normalizeCHString, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"

/**
 * Per-trace rollup the user aggregates are computed over. The `traces` MV
 * stores partial aggregation states per insert batch, so every read must
 * first finalize one row per trace before grouping by user.
 */
const USER_TRACE_ROLLUP = `
  SELECT
    trace_id,
    argMaxIfMerge(user_id)      AS user_id,
    argMaxIfMerge(user_email)   AS user_email,
    argMaxIfMerge(session_id)   AS session_id,
    min(min_start_time)         AS start_time,
    reinterpretAsInt64(max(max_end_time))
      - reinterpretAsInt64(min(min_start_time)) AS duration_ns,
    sum(error_count)            AS error_count,
    sum(tokens_input)           AS tokens_input,
    sum(tokens_output)          AS tokens_output,
    sum(tokens_total)           AS tokens_total,
    sum(cost_total_microcents)  AS trace_cost_microcents
  FROM traces
  WHERE organization_id = {organizationId:String}
    AND project_id = {projectId:String}
  GROUP BY organization_id, project_id, trace_id
`

const USER_SUMMARY_SELECT = `
  user_id,
  argMaxIf(user_email, start_time, user_email != '') AS user_email,
  min(start_time)                                    AS first_seen_at,
  max(start_time)                                    AS last_seen_at,
  count()                                            AS trace_count,
  uniqExact(coalesce(nullIf(session_id, ''), toString(trace_id))) AS session_count,
  uniqExactIf(coalesce(nullIf(session_id, ''), toString(trace_id)), error_count > 0) AS error_session_count,
  sum(tokens_total)                                  AS tokens_total,
  sum(trace_cost_microcents)                         AS cost_total_microcents,
  avg(trace_cost_microcents)                         AS cost_avg_microcents,
  quantileTDigest(0.5)(trace_cost_microcents)        AS cost_median_microcents
`

type UserSummaryRow = {
  user_id: string
  user_email: string
  first_seen_at: string
  last_seen_at: string
  trace_count: string
  session_count: string
  error_session_count: string
  tokens_total: string
  cost_total_microcents: string
  cost_avg_microcents: string
  cost_median_microcents: string
}

const toUserSummary = (row: UserSummaryRow): ProjectUserSummary => ({
  userId: ExternalUserId(normalizeCHString(row.user_id)),
  userEmail: normalizeCHString(row.user_email),
  firstSeenAt: parseCHDate(row.first_seen_at),
  lastSeenAt: parseCHDate(row.last_seen_at),
  traceCount: Number(row.trace_count),
  sessionCount: Number(row.session_count),
  errorSessionCount: Number(row.error_session_count),
  tokensTotal: Number(row.tokens_total),
  costTotalMicrocents: Number(row.cost_total_microcents),
  costAvgMicrocents: Number(row.cost_avg_microcents),
  costMedianMicrocents: Number(row.cost_median_microcents),
})

const SORT_EXPRS: Record<UserSortField, string> = {
  lastSeen: "last_seen_at",
  firstSeen: "first_seen_at",
  traces: "trace_count",
  sessions: "session_count",
  // "errors" sorts by rate, not count, matching the Errors column's leading value.
  errors: "error_session_count / greatest(session_count, 1)",
  tokens: "tokens_total",
  cost: "cost_total_microcents",
  costAvg: "cost_avg_microcents",
  costMedian: "cost_median_microcents",
}

const USAGE_DIMENSION_COLUMNS: Record<UserUsageDimension, string> = {
  model: "models",
  provider: "providers",
  tool: "tools",
}

const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, "\\$&")

// The search must run after GROUP BY: a user's displayed email is the latest
// non-empty one across their traces, so filtering per-trace rows would drop
// the (typically email-less) older traces of a matched user and skew their
// metrics. `user_email` here resolves to the surrounding query's `argMaxIf`
// alias — the SELECT must define it, and spelling the aggregate out instead
// would nest it inside the alias substitution (ILLEGAL_AGGREGATION).
const USER_SEARCH_HAVING = `HAVING (
  user_id ILIKE {searchQuery:String}
  OR user_email ILIKE {searchQuery:String}
)`

function buildUserScopeClauses(input: {
  readonly searchQuery?: string | undefined
  readonly timeRange?: { readonly from?: Date | undefined; readonly to?: Date | undefined } | undefined
}): { clauses: string; having: string; params: Record<string, unknown> } {
  const clauses: string[] = []
  const params: Record<string, unknown> = {}
  if (input.timeRange?.from) {
    clauses.push("AND start_time >= {fromTime:DateTime64(9, 'UTC')}")
    params.fromTime = formatCHDate(input.timeRange.from)
  }
  if (input.timeRange?.to) {
    clauses.push("AND start_time < {toTime:DateTime64(9, 'UTC')}")
    params.toTime = formatCHDate(input.timeRange.to)
  }
  let having = ""
  if (input.searchQuery) {
    having = USER_SEARCH_HAVING
    params.searchQuery = `%${escapeLikePattern(input.searchQuery)}%`
  }
  return { clauses: clauses.join("\n          "), having, params }
}

export const UserAnalyticsRepositoryLive = Layer.effect(
  UserAnalyticsRepository,
  Effect.gen(function* () {
    const listByProjectId: UserAnalyticsRepositoryShape["listByProjectId"] = ({ organizationId, projectId, options }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const limit = options?.limit ?? 50
        const offset = options?.offset ?? 0
        const sortExpr = SORT_EXPRS[options?.sortBy ?? "lastSeen"]
        const orderDir = options?.sortDirection === "asc" ? "ASC" : "DESC"
        const scope = buildUserScopeClauses({
          searchQuery: options?.searchQuery,
          timeRange: options?.timeRange,
        })
        const baseParams = {
          organizationId: organizationId as string,
          projectId: projectId as string,
          ...scope.params,
        }

        const [rows, countRows] = yield* Effect.all(
          [
            chSqlClient.query(async (client) => {
              const result = await client.query({
                query: `SELECT ${USER_SUMMARY_SELECT}
                      FROM (
                        SELECT *
                        FROM (${USER_TRACE_ROLLUP})
                        WHERE user_id != ''
                          ${scope.clauses}
                      )
                      GROUP BY user_id
                      ${scope.having}
                      ORDER BY ${sortExpr} ${orderDir}, user_id ASC
                      LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
                query_params: { ...baseParams, limit: limit + 1, offset },
                format: "JSONEachRow",
              })
              return result.json<UserSummaryRow>()
            }),
            chSqlClient.query(async (client) => {
              const result = await client.query({
                // One per-user aggregation pass yields the total user count and
                // the column-level cost rollup (one value per cost display mode).
                query: `SELECT
                        count()                                  AS total,
                        sum(user_cost_total)                     AS cost_sum,
                        avg(user_cost_avg)                       AS cost_avg,
                        quantileTDigest(0.5)(user_cost_median)   AS cost_median
                      FROM (
                        SELECT
                          user_id,
                          argMaxIf(user_email, start_time, user_email != '') AS user_email,
                          sum(trace_cost_microcents)                  AS user_cost_total,
                          avg(trace_cost_microcents)                  AS user_cost_avg,
                          quantileTDigest(0.5)(trace_cost_microcents) AS user_cost_median
                        FROM (${USER_TRACE_ROLLUP})
                        WHERE user_id != ''
                          ${scope.clauses}
                        GROUP BY user_id
                        ${scope.having}
                      )`,
                query_params: baseParams,
                format: "JSONEachRow",
              })
              return result.json<{ total: string; cost_sum: string; cost_avg: string; cost_median: string }>()
            }),
          ],
          { concurrency: 2 },
        ).pipe(Effect.mapError((error) => toRepositoryError(error, "listByProjectId")))

        const hasMore = rows.length > limit
        const pageRows = hasMore ? rows.slice(0, limit) : rows
        const countRow = countRows[0]
        const finiteOrZero = (raw: string | undefined): number => {
          const value = Number(raw ?? 0)
          return Number.isFinite(value) ? value : 0
        }
        return {
          items: pageRows.map(toUserSummary),
          totalCount: Number(countRow?.total ?? 0),
          hasMore,
          limit,
          offset,
          costRollup: {
            sum: finiteOrZero(countRow?.cost_sum),
            avg: finiteOrZero(countRow?.cost_avg),
            median: finiteOrZero(countRow?.cost_median),
          },
        }
      })

    const activityByUserIds: UserAnalyticsRepositoryShape["activityByUserIds"] = ({
      organizationId,
      projectId,
      userIds,
      timeRange,
      bucketSeconds,
      errorsOnly,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        if (userIds.length === 0) return []

        const rows = yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT
                      user_id,
                      toDateTime(
                        intDiv(toUnixTimestamp(start_time), {bucketSeconds:UInt32}) * {bucketSeconds:UInt32},
                        'UTC'
                      ) AS bucket_start,
                      uniqExact(coalesce(nullIf(session_id, ''), toString(trace_id))) AS count,
                      uniqExactIf(coalesce(nullIf(session_id, ''), toString(trace_id)), error_count > 0) AS errored_count
                    FROM (${USER_TRACE_ROLLUP})
                    WHERE user_id IN ({userIds:Array(String)})
                      AND start_time >= {fromTime:DateTime64(9, 'UTC')}
                      AND start_time < {toTime:DateTime64(9, 'UTC')}
                      ${errorsOnly ? "AND error_count > 0" : ""}
                    GROUP BY user_id, bucket_start
                    ORDER BY user_id ASC, bucket_start ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                userIds: userIds as readonly string[],
                bucketSeconds: Math.floor(bucketSeconds),
                fromTime: formatCHDate(timeRange.from),
                toTime: formatCHDate(timeRange.to),
              },
              format: "JSONEachRow",
            })
            return result.json<{ user_id: string; bucket_start: string; count: string; errored_count: string }>()
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "activityByUserIds")))

        const bucketsByUserId = new Map<string, { bucket: string; count: number; errorCount: number }[]>()
        for (const row of rows) {
          const userId = normalizeCHString(row.user_id)
          const buckets = bucketsByUserId.get(userId) ?? []
          buckets.push({
            bucket: parseCHDate(row.bucket_start).toISOString(),
            count: Number(row.count),
            errorCount: Number(row.errored_count),
          })
          bucketsByUserId.set(userId, buckets)
        }
        return userIds.map(
          (userId): UserActivitySeries => ({
            userId,
            buckets: bucketsByUserId.get(userId as string) ?? [],
          }),
        )
      })

    const getOverviewByProjectId: UserAnalyticsRepositoryShape["getOverviewByProjectId"] = ({
      organizationId,
      projectId,
      timeRange,
      bucketSeconds,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const params = {
          organizationId: organizationId as string,
          projectId: projectId as string,
          fromTime: formatCHDate(timeRange.from),
          toTime: formatCHDate(timeRange.to),
        }

        const [summaryRows, newUserRows, histogramRows] = yield* Effect.all(
          [
            chSqlClient.query(async (client) => {
              const result = await client.query({
                query: `SELECT
                        uniqExactIf(user_id, user_id != '') AS unique_users,
                        countIf(user_id != '')              AS identified_traces,
                        count()                             AS total_traces,
                        uniqExact(coalesce(nullIf(session_id, ''), toString(trace_id))) AS total_sessions,
                        uniqExactIf(coalesce(nullIf(session_id, ''), toString(trace_id)), user_id != '') AS identified_sessions
                      FROM (${USER_TRACE_ROLLUP})
                      WHERE start_time >= {fromTime:DateTime64(9, 'UTC')}
                        AND start_time < {toTime:DateTime64(9, 'UTC')}`,
                query_params: params,
                format: "JSONEachRow",
              })
              return result.json<{
                unique_users: string
                identified_traces: string
                total_traces: string
                total_sessions: string
                identified_sessions: string
              }>()
            }),
            chSqlClient.query(async (client) => {
              const result = await client.query({
                query: `SELECT countIf(
                        first_seen >= {fromTime:DateTime64(9, 'UTC')}
                        AND first_seen < {toTime:DateTime64(9, 'UTC')}
                      ) AS new_users
                      FROM (
                        SELECT user_id, min(start_time) AS first_seen
                        FROM (${USER_TRACE_ROLLUP})
                        WHERE user_id != ''
                        GROUP BY user_id
                      )`,
                query_params: params,
                format: "JSONEachRow",
              })
              return result.json<{ new_users: string }>()
            }),
            chSqlClient.query(async (client) => {
              const result = await client.query({
                query: `SELECT
                        toDateTime(
                          intDiv(toUnixTimestamp(start_time), {bucketSeconds:UInt32}) * {bucketSeconds:UInt32},
                          'UTC'
                        ) AS bucket_start,
                        uniqExact(user_id) AS active_users,
                        count()            AS trace_count,
                        uniqExact(coalesce(nullIf(session_id, ''), toString(trace_id))) AS session_count,
                        uniqExactIf(coalesce(nullIf(session_id, ''), toString(trace_id)), error_count > 0) AS error_session_count
                      FROM (${USER_TRACE_ROLLUP})
                      WHERE user_id != ''
                        AND start_time >= {fromTime:DateTime64(9, 'UTC')}
                        AND start_time < {toTime:DateTime64(9, 'UTC')}
                      GROUP BY bucket_start
                      ORDER BY bucket_start ASC`,
                query_params: { ...params, bucketSeconds: Math.floor(bucketSeconds) },
                format: "JSONEachRow",
              })
              return result.json<{
                bucket_start: string
                active_users: string
                trace_count: string
                session_count: string
                error_session_count: string
              }>()
            }),
          ],
          { concurrency: 3 },
        ).pipe(Effect.mapError((error) => toRepositoryError(error, "getOverviewByProjectId")))

        const summary = summaryRows[0]
        return {
          uniqueUsers: Number(summary?.unique_users ?? 0),
          newUsers: Number(newUserRows[0]?.new_users ?? 0),
          identifiedTraces: Number(summary?.identified_traces ?? 0),
          totalTraces: Number(summary?.total_traces ?? 0),
          identifiedSessions: Number(summary?.identified_sessions ?? 0),
          totalSessions: Number(summary?.total_sessions ?? 0),
          histogram: histogramRows.map((row) => ({
            bucket: parseCHDate(row.bucket_start).toISOString(),
            activeUsers: Number(row.active_users),
            traceCount: Number(row.trace_count),
            sessionCount: Number(row.session_count),
            errorSessionCount: Number(row.error_session_count),
          })),
        } satisfies UsersOverview
      })

    const findByUserId: UserAnalyticsRepositoryShape["findByUserId"] = ({
      organizationId,
      projectId,
      userId,
      errorsOnly,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT ${USER_SUMMARY_SELECT},
                      sum(tokens_input)            AS tokens_input,
                      sum(tokens_output)           AS tokens_output,
                      avg(duration_ns)             AS avg_duration_ns,
                      uniqExact(toDate(start_time)) AS active_days
                    FROM (${USER_TRACE_ROLLUP})
                    WHERE user_id = {userId:String}
                      ${errorsOnly ? "AND error_count > 0" : ""}
                    GROUP BY user_id`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                userId: userId as string,
              },
              format: "JSONEachRow",
            })
            return result.json<
              UserSummaryRow & {
                tokens_input: string
                tokens_output: string
                avg_duration_ns: string
                active_days: string
              }
            >()
          })
          .pipe(
            Effect.flatMap((rows) => {
              const row = rows[0]
              if (!row) {
                return Effect.fail(new NotFoundError({ entity: "User", id: userId as string }))
              }
              return Effect.succeed({
                ...toUserSummary(row),
                tokensInput: Number(row.tokens_input),
                tokensOutput: Number(row.tokens_output),
                avgDurationNs: Number(row.avg_duration_ns),
                activeDays: Number(row.active_days),
              } satisfies UserProfile)
            }),
            Effect.mapError((error) => (isNotFoundError(error) ? error : toRepositoryError(error, "findByUserId"))),
          )
      })

    const usageBreakdownByUserId: UserAnalyticsRepositoryShape["usageBreakdownByUserId"] = ({
      organizationId,
      projectId,
      userId,
      dimension,
      limit,
      errorsOnly,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const column = USAGE_DIMENSION_COLUMNS[dimension]

        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT value, count() AS trace_count
                    FROM (
                      SELECT trace_id, arrayJoin(${column}) AS value
                      FROM (
                        SELECT
                          trace_id,
                          argMaxIfMerge(user_id) AS user_id,
                          groupUniqArrayIfMerge(${column}) AS ${column},
                          sum(error_count) AS error_count
                        FROM traces
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                        GROUP BY organization_id, project_id, trace_id
                      )
                      WHERE user_id = {userId:String}
                        ${errorsOnly ? "AND error_count > 0" : ""}
                    )
                    WHERE value != ''
                    GROUP BY value
                    ORDER BY trace_count DESC, value ASC
                    LIMIT {limit:UInt32}`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                userId: userId as string,
                limit: limit ?? 10,
              },
              format: "JSONEachRow",
            })
            return result.json<{ value: string; trace_count: string }>()
          })
          .pipe(
            Effect.map((rows) =>
              rows.map((row) => ({ value: normalizeCHString(row.value), traceCount: Number(row.trace_count) })),
            ),
            Effect.mapError((error) => toRepositoryError(error, "usageBreakdownByUserId")),
          )
      })

    return {
      listByProjectId,
      activityByUserIds,
      getOverviewByProjectId,
      findByUserId,
      usageBreakdownByUserId,
    }
  }),
)
