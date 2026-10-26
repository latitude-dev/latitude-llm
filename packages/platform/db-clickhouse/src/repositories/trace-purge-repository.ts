import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape, SessionId, toRepositoryError } from "@domain/shared"
import { type PurgedRowCounts, TracePurgeRepository, type TracePurgeRepositoryShape } from "@domain/spans"
import { Effect, Layer } from "effect"

interface PurgeTarget {
  readonly table: string
  readonly where: string
}

const SCOPE = "organization_id = {organizationId:String} AND project_id = {projectId:String}"

const TRACE_TARGETS: readonly PurgeTarget[] = [
  "spans",
  "traces",
  "trace_search_documents",
  "trace_search_embeddings",
  "trace_message_occurrences",
  "scores",
  "memory_events",
  "memory_current",
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

const SESSION_REBUILD_FILTER = ` WHERE s.organization_id = {organizationId:String}
  AND s.project_id = {projectId:String}
  AND s.session_id IN {sessionIds:Array(String)}`

/**
 * Re-aggregates the given sessions from their surviving spans using the live
 * `sessions_mv` definition, so the rebuild can never drift from the view that
 * maintains `sessions` on ingest.
 */
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
  ]).then(([views, columns]) => {
    const select = views[0]?.as_select ?? ""
    if ((select.match(SESSIONS_MV_GROUP_BY) ?? []).length !== 1 || columns.length === 0) {
      throw new Error("sessions_mv no longer has the `FROM spans AS s GROUP BY` shape the session rebuild relies on")
    }
    const scoped = select.replace(SESSIONS_MV_GROUP_BY, `$1${SESSION_REBUILD_FILTER}$2`)
    return `INSERT INTO sessions (${columns.map((column) => `\`${column.name}\``).join(", ")}) ${scoped}`
  })

const purgeTargets = async (
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
    const rows = Number(row?.rows ?? 0)
    if (rows > 0) {
      await client.command({ query: `DELETE FROM ${target.table} WHERE ${target.where}`, query_params: params })
    }
    counts[target.table] = (counts[target.table] ?? 0) + rows
  }
  return counts
}

export const TracePurgeRepositoryLive = Layer.effect(
  TracePurgeRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    const listSessionIdsByTraceIds: TracePurgeRepositoryShape["listSessionIdsByTraceIds"] = (input) => {
      const traceIds = [...new Set(input.traceIds)]
      if (traceIds.length === 0) return Effect.succeed([])

      return chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT DISTINCT coalesce(nullIf(session_id, ''), toString(trace_id)) AS session_id
                    FROM spans
                    WHERE ${SCOPE} AND trace_id IN {traceIds:Array(String)}`,
            query_params: {
              organizationId: input.organizationId as string,
              projectId: input.projectId as string,
              traceIds,
            },
            format: "JSONEachRow",
          })
          const rows = await result.json<{ session_id: string }>()
          return rows.map((row) => SessionId(row.session_id))
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "TracePurgeRepository.listSessionIdsByTraceIds")))
    }

    const purgeTraces: TracePurgeRepositoryShape["purgeTraces"] = (input) => {
      const traceIds = [...new Set(input.traceIds)]
      if (traceIds.length === 0) return Effect.succeed({})

      return chSqlClient
        .query((client) =>
          purgeTargets(client, TRACE_TARGETS, {
            organizationId: input.organizationId as string,
            projectId: input.projectId as string,
            traceIds,
          }),
        )
        .pipe(Effect.mapError((error) => toRepositoryError(error, "TracePurgeRepository.purgeTraces")))
    }

    const purgeSessions: TracePurgeRepositoryShape["purgeSessions"] = (input) => {
      const sessionIds = [...new Set(input.sessionIds)]
      if (sessionIds.length === 0) return Effect.succeed({ deleted: {}, rebuiltSessions: 0 })

      const params = {
        organizationId: input.organizationId as string,
        projectId: input.projectId as string,
        sessionIds,
      }

      return chSqlClient
        .query(async (client) => {
          const rebuildQuery = await buildSessionRebuildQuery(client)
          const deleted = await purgeTargets(client, SESSION_TARGETS, params)

          const result = await client.query({
            query: `SELECT uniqExact(session_id) AS sessions
                    FROM spans
                    WHERE ${SCOPE} AND session_id IN {sessionIds:Array(String)}`,
            query_params: params,
            format: "JSONEachRow",
          })
          const [row] = await result.json<{ sessions: string | number }>()
          const rebuiltSessions = Number(row?.sessions ?? 0)
          if (rebuiltSessions > 0) {
            await client.command({ query: rebuildQuery, query_params: params })
          }

          return { deleted, rebuiltSessions }
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "TracePurgeRepository.purgeSessions")))
    }

    return {
      listSessionIdsByTraceIds,
      purgeTraces,
      purgeSessions,
    } satisfies TracePurgeRepositoryShape
  }),
)
