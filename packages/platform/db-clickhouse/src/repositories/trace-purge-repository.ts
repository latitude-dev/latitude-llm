import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape, SessionId, toRepositoryError } from "@domain/shared"
import { type PurgedRowCounts, TracePurgeRepository, type TracePurgeRepositoryShape } from "@domain/spans"
import { Effect, Layer } from "effect"

interface PurgeTarget {
  readonly table: string
  readonly where: string
}

const SCOPE = "organization_id = {organizationId:String} AND project_id = {projectId:String}"

// `traces` goes last: it is what deletion requests list from, so a batch that fails
// part-way stays listable and its retry finishes the job.
const TRACE_TARGETS: readonly PurgeTarget[] = [
  "trace_search_documents",
  "trace_search_embeddings",
  "trace_message_occurrences",
  "scores",
  "memory_events",
  "memory_current",
  "spans",
  "traces",
].map((table) => ({ table, where: `${SCOPE} AND trace_id IN {traceIds:Array(String)}` }))

const SESSION_TARGETS: readonly PurgeTarget[] = [
  ...[
    "sessions",
    "session_analyses",
    "session_semantic_moments",
    "session_moment_labels",
    "taxonomy_observations",
    "taxonomy_facet_projections",
    "taxonomy_view_assignments",
    "flagger_screening_decisions",
    "flagger_jev_shadow_observations",
    "flagger_jev_preclassifier_observations",
  ].map((table) => ({ table, where: `${SCOPE} AND session_id IN {sessionIds:Array(String)}` })),
  { table: "scores", where: `${SCOPE} AND trace_id = '' AND session_id IN {sessionIds:Array(String)}` },
]

const SESSIONS_MV_GROUP_BY = /(\sFROM\s+(?:`?\w+`?\.)?`?spans`?\s+AS\s+s)(\s+GROUP\s+BY\s)/gi

// Matches spans by the key `sessions_mv` groups on. The first clause is only there so the
// bloom indexes apply; `trace_id` is FixedString(32), so it is only compared against keys that fit.
const SESSION_MEMBERSHIP = `(s.session_id IN {sessionIds:Array(String)} OR s.trace_id IN {sessionTraceKeys:Array(String)})
  AND coalesce(nullIf(s.session_id, ''), toString(s.trace_id)) IN {sessionIds:Array(String)}`

const SESSION_REBUILD_FILTER = ` WHERE s.organization_id = {organizationId:String}
  AND s.project_id = {projectId:String}
  AND ${SESSION_MEMBERSHIP}`

/**
 * Turns the `sessions_mv` definition into an insert that re-aggregates only the given
 * sessions, so the rebuild can never drift from the view that maintains `sessions` on ingest.
 */
export const scopeSessionsMvToRebuild = (select: string, columns: readonly string[]): string => {
  if ((select.match(SESSIONS_MV_GROUP_BY) ?? []).length !== 1 || columns.length === 0) {
    throw new Error("sessions_mv no longer has the `FROM spans AS s GROUP BY` shape the session rebuild relies on")
  }
  const scoped = select.replace(SESSIONS_MV_GROUP_BY, `$1${SESSION_REBUILD_FILTER}$2`)
  return `INSERT INTO sessions (${columns.map((column) => `\`${column}\``).join(", ")}) ${scoped}`
}

const buildSessionRebuildQuery = (client: ClickHouseClient): Promise<string> =>
  Promise.all([
    client
      .query({
        query: `SELECT as_select FROM system.tables WHERE database = currentDatabase() AND name = 'sessions_mv'`,
        format: "JSONEachRow",
      })
      .then((result) => result.json<{ as_select: string }>()),
    client
      .query({
        query: `SELECT name FROM system.columns
                WHERE database = currentDatabase() AND table = 'sessions_mv'
                ORDER BY position`,
        format: "JSONEachRow",
      })
      .then((result) => result.json<{ name: string }>()),
  ]).then(([views, columns]) =>
    scopeSessionsMvToRebuild(
      views[0]?.as_select ?? "",
      columns.map((column) => column.name),
    ),
  )

const countTargets = async (
  client: ClickHouseClient,
  targets: readonly PurgeTarget[],
  params: Record<string, unknown>,
): Promise<PurgedRowCounts> => {
  const counts: Record<string, number> = {}
  for (const target of targets) {
    const result = await client.query({
      query: `SELECT count() AS rows FROM ${target.table} WHERE ${target.where}`,
      query_params: params,
      format: "JSONEachRow",
    })
    const [row] = await result.json<{ rows: string | number }>()
    counts[target.table] = (counts[target.table] ?? 0) + Number(row?.rows ?? 0)
  }
  return counts
}

const deleteTargets = async (
  client: ClickHouseClient,
  targets: readonly PurgeTarget[],
  params: Record<string, unknown>,
): Promise<void> => {
  for (const target of targets) {
    await client.command({ query: `DELETE FROM ${target.table} WHERE ${target.where}`, query_params: params })
  }
}

const traceParams = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceIds: readonly string[]
}) => ({
  organizationId: input.organizationId,
  projectId: input.projectId,
  traceIds: [...new Set(input.traceIds)],
})

const sessionParams = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionIds: readonly string[]
}) => {
  const sessionIds = [...new Set(input.sessionIds)]
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionIds,
    sessionTraceKeys: sessionIds.filter((key) => key.length === 32),
  }
}

export const TracePurgeRepositoryLive = Layer.effect(
  TracePurgeRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    const listSessionIdsByTraceIds: TracePurgeRepositoryShape["listSessionIdsByTraceIds"] = (input) => {
      const params = traceParams(input)
      if (params.traceIds.length === 0) return Effect.succeed([])

      return chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT DISTINCT session_id
                    FROM (
                      SELECT session_id
                      FROM spans
                      WHERE ${SCOPE} AND trace_id IN {traceIds:Array(String)}
                      UNION ALL
                      SELECT argMaxIfMerge(session_id) AS session_id
                      FROM traces
                      WHERE ${SCOPE} AND trace_id IN {traceIds:Array(String)}
                      GROUP BY trace_id
                    )
                    WHERE session_id != ''`,
            query_params: params,
            format: "JSONEachRow",
          })
          const rows = await result.json<{ session_id: string }>()
          return [...new Set([...rows.map((row) => row.session_id), ...params.traceIds])].map(SessionId)
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "TracePurgeRepository.listSessionIdsByTraceIds")))
    }

    const countTraceRows: TracePurgeRepositoryShape["countTraceRows"] = (input) => {
      const params = traceParams(input)
      if (params.traceIds.length === 0) return Effect.succeed({})

      return chSqlClient
        .query((client) => countTargets(client, TRACE_TARGETS, params))
        .pipe(Effect.mapError((error) => toRepositoryError(error, "TracePurgeRepository.countTraceRows")))
    }

    const purgeTraces: TracePurgeRepositoryShape["purgeTraces"] = (input) => {
      const params = traceParams(input)
      if (params.traceIds.length === 0) return Effect.void

      return chSqlClient
        .query((client) => deleteTargets(client, TRACE_TARGETS, params))
        .pipe(Effect.mapError((error) => toRepositoryError(error, "TracePurgeRepository.purgeTraces")))
    }

    const countSessionRows: TracePurgeRepositoryShape["countSessionRows"] = (input) => {
      const params = sessionParams(input)
      if (params.sessionIds.length === 0) return Effect.succeed({})

      return chSqlClient
        .query((client) => countTargets(client, SESSION_TARGETS, params))
        .pipe(Effect.mapError((error) => toRepositoryError(error, "TracePurgeRepository.countSessionRows")))
    }

    const purgeSessions: TracePurgeRepositoryShape["purgeSessions"] = (input) => {
      const params = sessionParams(input)
      if (params.sessionIds.length === 0) return Effect.succeed({ rebuiltSessions: 0 })

      return chSqlClient
        .query(async (client) => {
          const rebuildQuery = await buildSessionRebuildQuery(client)
          await deleteTargets(client, SESSION_TARGETS, params)

          const result = await client.query({
            query: `SELECT uniqExact(coalesce(nullIf(s.session_id, ''), toString(s.trace_id))) AS sessions
                    FROM spans AS s
                    WHERE s.organization_id = {organizationId:String}
                      AND s.project_id = {projectId:String}
                      AND ${SESSION_MEMBERSHIP}`,
            query_params: params,
            format: "JSONEachRow",
          })
          const [row] = await result.json<{ sessions: string | number }>()
          const rebuiltSessions = Number(row?.sessions ?? 0)
          if (rebuiltSessions > 0) {
            await client.command({ query: rebuildQuery, query_params: params })
          }

          return { rebuiltSessions }
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "TracePurgeRepository.purgeSessions")))
    }

    return {
      listSessionIdsByTraceIds,
      countTraceRows,
      purgeTraces,
      countSessionRows,
      purgeSessions,
    } satisfies TracePurgeRepositoryShape
  }),
)
