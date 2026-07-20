import type { ClickHouseClient } from "@clickhouse/client"
import { DEFAULT_EMBEDDING_CONFIG, resolveEmbeddingConfig } from "@domain/ai"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { type MessageEmbeddingRole, TraceSearchRepository, type TraceSearchRepositoryShape } from "@domain/spans"
import { formatCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"
import { BOILERPLATE_FILTER_PARAMS, BOILERPLATE_HASH_FILTER } from "./search-plan.ts"

const resolveSharedEmbeddingModel = (): string =>
  Effect.runSync(resolveEmbeddingConfig().pipe(Effect.orElseSucceed(() => DEFAULT_EMBEDDING_CONFIG))).model

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
                start_time: formatCHDate(row.startTime),
                root_span_name: row.rootSpanName,
                search_text: row.searchText,
                content_hash: row.contentHash,
                retention_days: row.retentionDays ?? 90,
                indexed_at: formatCHDate(new Date()),
              },
            ],
            format: "JSONEachRow",
          })
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "upsertDocument")))

    const upsertMessageOccurrences: TraceSearchRepositoryShape["upsertMessageOccurrences"] = (rows) => {
      if (rows.length === 0) return Effect.void

      const indexedAt = formatCHDate(new Date())
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
              start_time: formatCHDate(row.startTime),
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

    const listMessageOccurrencesForTraces: TraceSearchRepositoryShape["listMessageOccurrencesForTraces"] = (args) => {
      if (args.traceIds.length === 0) return Effect.succeed([])
      return chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT
                      argMax(content_hash, indexed_at) AS content_hash,
                      argMax(role, indexed_at) AS role
                    FROM trace_message_occurrences
                    WHERE organization_id = {organizationId:String}
                      AND project_id = {projectId:String}
                      AND trace_id IN {traceIds:Array(FixedString(32))}
                    GROUP BY organization_id, project_id, trace_id, message_index`,
            query_params: {
              organizationId: args.organizationId as string,
              projectId: args.projectId as string,
              traceIds: args.traceIds.map((traceId) => traceId as string),
            },
            format: "JSONEachRow",
          })
          const rows = await result.json<{ content_hash: string; role: string }>()
          return rows.map((row) => ({ contentHash: row.content_hash, role: row.role as MessageEmbeddingRole }))
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "listMessageOccurrencesForTraces")))
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
                      FROM message_embeddings
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND embedding_model = {embeddingModel:String}
                        -- Bound the per-vector cosineDistance scan to this trace's
                        -- own messages; without it ClickHouse scores every vector
                        -- in the project to highlight a single trace.
                        AND content_hash IN (
                          SELECT content_hash
                          FROM trace_message_occurrences
                          WHERE organization_id = {organizationId:String}
                            AND project_id = {projectId:String}
                            AND trace_id = {traceId:FixedString(32)}
                        )
                    ) AS e ON o.content_hash = e.content_hash
                    WHERE o.role IN ('user', 'assistant')
                      AND ${BOILERPLATE_HASH_FILTER}`,
            query_params: {
              organizationId: args.organizationId as string,
              projectId: args.projectId as string,
              traceId: args.traceId,
              embeddingModel: resolveSharedEmbeddingModel(),
              queryEmbedding: [...args.queryEmbedding],
              ...BOILERPLATE_FILTER_PARAMS,
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
      listMessageOccurrencesForTraces,
      findSemanticHighlightForTrace,
    } satisfies TraceSearchRepositoryShape
  }),
)
