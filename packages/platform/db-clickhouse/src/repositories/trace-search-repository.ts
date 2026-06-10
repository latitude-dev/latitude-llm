import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { TRACE_SEARCH_EMBEDDING_MODEL, TraceSearchRepository, type TraceSearchRepositoryShape } from "@domain/spans"
import { Effect, Layer } from "effect"

// ClickHouse DateTime64(9, 'UTC') rejects trailing 'Z'; strip it.
const toClickhouseDateTime = (date: Date): string => date.toISOString().replace("Z", "")

export const TraceSearchRepositoryLive = Layer.effect(
  TraceSearchRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    const upsertDocument: TraceSearchRepositoryShape["upsertDocument"] = (row) =>
      chSqlClient
        .query(async (client) => {
          await client.insert({
            table: "trace_search_documents",
            values: [
              {
                organization_id: row.organizationId as string,
                project_id: row.projectId as string,
                trace_id: row.traceId,
                start_time: toClickhouseDateTime(row.startTime),
                root_span_name: row.rootSpanName,
                search_text: row.searchText,
                content_hash: row.contentHash,
                retention_days: row.retentionDays ?? 90,
                indexed_at: toClickhouseDateTime(new Date()),
              },
            ],
            format: "JSONEachRow",
          })
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "upsertDocument")))

    const upsertMessageOccurrences: TraceSearchRepositoryShape["upsertMessageOccurrences"] = (rows) => {
      if (rows.length === 0) return Effect.void

      const indexedAt = toClickhouseDateTime(new Date())
      return chSqlClient
        .query(async (client) => {
          await client.insert({
            table: "trace_message_occurrences",
            values: rows.map((row) => ({
              organization_id: row.organizationId as string,
              project_id: row.projectId as string,
              trace_id: row.traceId,
              message_index: row.messageIndex,
              content_hash: row.contentHash,
              session_id: row.sessionId as string,
              start_time: toClickhouseDateTime(row.startTime),
              role: row.role,
              is_output: row.isOutput ? 1 : 0,
              retention_days: row.retentionDays ?? 30,
              indexed_at: indexedAt,
            })),
            format: "JSONEachRow",
          })
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "upsertMessageOccurrences")))
    }

    const findSemanticHighlightForTrace: TraceSearchRepositoryShape["findSemanticHighlightForTrace"] = (args) =>
      chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT
                      argMax(o.message_index, semantic_score) AS message_index,
                      max(semantic_score)                     AS relevance_score,
                      count() AS row_count
                    FROM (
                      SELECT
                        organization_id,
                        project_id,
                        trace_id,
                        message_index,
                        argMax(content_hash, indexed_at) AS content_hash,
                        argMax(role, indexed_at) AS role
                      FROM trace_message_occurrences
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND trace_id = {traceId:FixedString(32)}
                      GROUP BY organization_id, project_id, trace_id, message_index
                    ) AS o
                      INNER JOIN (
                        SELECT
                          content_hash,
                          (1 - cosineDistance(embedding, {queryEmbedding:Array(Float32)})) AS semantic_score
                        FROM (
                          SELECT
                            content_hash,
                            argMax(embedding, last_seen_at) AS embedding
                          FROM message_embeddings
                          WHERE organization_id = {organizationId:String}
                            AND project_id = {projectId:String}
                            AND embedding_model = {embeddingModel:String}
                          GROUP BY content_hash
                        ) AS latest_embeddings
                    ) AS e ON o.content_hash = e.content_hash
                    WHERE o.role IN ('user', 'assistant')`,
            query_params: {
              organizationId: args.organizationId as string,
              projectId: args.projectId as string,
              traceId: args.traceId,
              embeddingModel: TRACE_SEARCH_EMBEDDING_MODEL,
              queryEmbedding: [...args.queryEmbedding],
            },
            format: "JSONEachRow",
          })

          const [row] = await result.json<{
            message_index: number
            relevance_score: number
            row_count: string | number
          }>()

          if (!row || Number(row.row_count) === 0) return null

          return {
            chunkIndex: row.message_index,
            firstMessageIndex: row.message_index,
            lastMessageIndex: row.message_index,
            relevanceScore: row.relevance_score,
          }
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "findSemanticHighlightForTrace")))

    return {
      upsertDocument,
      upsertMessageOccurrences,
      findSemanticHighlightForTrace,
    } satisfies TraceSearchRepositoryShape
  }),
)
