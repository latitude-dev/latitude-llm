import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { TraceTombstoneRepository, type TraceTombstoneRepositoryShape, tombstoneKey } from "@domain/spans"
import { formatCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"

// Matches the table TTL; reads filter on it too, because TTL deletes only on merge.
const TOMBSTONE_GRACE_DAYS = 30

export const TraceTombstoneRepositoryLive = Layer.effect(
  TraceTombstoneRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    const record: TraceTombstoneRepositoryShape["record"] = (input) => {
      if (input.traceIds.length === 0) return Effect.void
      const deletedAt = formatCHDate(new Date())

      return chSqlClient
        .query(async (client, organizationId, signal) => {
          if (input.organizationId !== organizationId) {
            throw new Error("Trace tombstone organization does not match the ClickHouse scope")
          }
          await client.insert({
            table: "trace_tombstones",
            values: [...new Set(input.traceIds)].map((traceId) => ({
              organization_id: organizationId,
              project_id: input.projectId,
              trace_id: traceId,
              deleted_at: deletedAt,
            })),
            format: "JSONEachRow",
            abort_signal: signal,
          })
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "TraceTombstoneRepository.record")))
    }

    const listTombstoned: TraceTombstoneRepositoryShape["listTombstoned"] = (input) => {
      const projectIds = [...new Set(input.candidates.map((candidate) => candidate.projectId as string))]
      const traceIds = [...new Set(input.candidates.map((candidate) => candidate.traceId as string))].filter(
        (traceId) => traceId.length === 32,
      )
      if (projectIds.length === 0 || traceIds.length === 0) return Effect.succeed(new Set<string>())

      return chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT DISTINCT project_id, trace_id
                    FROM trace_tombstones
                    WHERE organization_id = {organizationId:String}
                      AND project_id IN {projectIds:Array(String)}
                      AND trace_id IN {traceIds:Array(String)}
                      AND deleted_at >= now64(3) - toIntervalDay({graceDays:UInt32})`,
            query_params: {
              organizationId: input.organizationId,
              projectIds,
              traceIds,
              graceDays: TOMBSTONE_GRACE_DAYS,
            },
            format: "JSONEachRow",
          })
          const rows = await result.json<{ project_id: string; trace_id: string }>()
          const candidateKeys = new Set(input.candidates.map(tombstoneKey))
          return new Set(
            rows.map((row) => `${row.project_id}:${row.trace_id}`).filter((key) => candidateKeys.has(key)),
          ) as ReadonlySet<string>
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "TraceTombstoneRepository.listTombstoned")))
    }

    return { record, listTombstoned }
  }),
)
