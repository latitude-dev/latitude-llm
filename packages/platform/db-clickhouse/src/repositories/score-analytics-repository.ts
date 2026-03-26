import type { ClickHouseClient } from "@clickhouse/client"
import type { Score } from "@domain/scores"
import { ScoreAnalyticsRepository } from "@domain/scores"
import { ChSqlClient, type ChSqlClientShape, type ScoreId } from "@domain/shared"
import { Effect, Layer } from "effect"

const toClickHouseDateTime64 = (value: Date) => value.toISOString().replace("T", " ").replace("Z", "")

const toAnalyticsRow = (score: Score) => ({
  id: score.id,
  organization_id: score.organizationId,
  project_id: score.projectId,
  session_id: score.sessionId ?? "",
  trace_id: score.traceId ?? "",
  span_id: score.spanId ?? "",
  source: score.source,
  source_id: score.sourceId,
  simulation_id: score.simulationId ?? "",
  issue_id: score.issueId ?? "",
  value: score.value,
  passed: score.passed,
  errored: score.errored,
  duration: score.duration,
  tokens: score.tokens,
  cost: score.cost,
  created_at: toClickHouseDateTime64(score.createdAt),
})

export const ScoreAnalyticsRepositoryLive = Layer.effect(
  ScoreAnalyticsRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    return {
      existsById: (id: ScoreId) =>
        chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: "SELECT id FROM scores WHERE id = {id:FixedString(24)} LIMIT 1",
              query_params: { id },
              format: "JSONEachRow",
            })

            return result.json<{ id: string }>()
          })
          .pipe(Effect.map((rows) => rows.length > 0)),

      insert: (score: Score) =>
        chSqlClient.query(async (client) => {
          await client.insert({
            table: "scores",
            values: [toAnalyticsRow(score)],
            format: "JSONEachRow",
          })
        }),
    }
  }),
)
