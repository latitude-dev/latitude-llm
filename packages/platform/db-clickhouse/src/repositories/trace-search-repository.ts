import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { TraceSearchRepository, type TraceSearchRepositoryShape } from "@domain/spans"
import { parseEnv } from "@platform/env"
import { Effect, Layer } from "effect"

// ClickHouse DateTime64(9, 'UTC') rejects trailing 'Z'; strip it.
const toClickhouseDateTime = (date: Date): string => date.toISOString().replace("Z", "")
const useSharedMessageEmbeddingsReads = (): boolean =>
  Effect.runSync(parseEnv("LAT_TRACE_SEARCH_SHARED_MESSAGE_EMBEDDINGS_READS", "boolean", false))

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

    const upsertEmbedding: TraceSearchRepositoryShape["upsertEmbedding"] = (row) =>
      chSqlClient
        .query(async (client) => {
          await client.insert({
            table: "trace_search_embeddings",
            values: [
              {
                organization_id: row.organizationId as string,
                project_id: row.projectId as string,
                trace_id: row.traceId,
                chunk_index: row.chunkIndex,
                start_time: toClickhouseDateTime(row.startTime),
                content_hash: row.contentHash,
                embedding_model: row.embeddingModel,
                embedding: [...row.embedding],
                retention_days: row.retentionDays ?? 30,
                first_message_index: row.firstMessageIndex ?? null,
                last_message_index: row.lastMessageIndex ?? null,
                indexed_at: toClickhouseDateTime(new Date()),
              },
            ],
            format: "JSONEachRow",
          })
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "upsertEmbedding")))

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

    const hasEmbeddingWithHash: TraceSearchRepositoryShape["hasEmbeddingWithHash"] = (
      organizationId,
      projectId,
      traceId,
      chunkIndex,
      contentHash,
    ) =>
      chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT 1 FROM trace_search_embeddings
                    WHERE organization_id = {organizationId:String}
                      AND project_id = {projectId:String}
                      AND trace_id = {traceId:FixedString(32)}
                      AND chunk_index = {chunkIndex:UInt16}
                      AND content_hash = {contentHash:String}
                    LIMIT 1`,
            query_params: {
              organizationId: organizationId as string,
              projectId: projectId as string,
              traceId,
              chunkIndex,
              contentHash,
            },
            format: "JSONEachRow",
          })
          const rows = await result.json<{ "1": number }[]>()
          return rows.length > 0
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "hasEmbeddingWithHash")))

    const findLegacySemanticHighlightForTrace: TraceSearchRepositoryShape["findSemanticHighlightForTrace"] = (args) =>
      chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT
                      argMax(chunk_index, semantic_score)         AS chunk_index,
                      argMax(first_message_index, semantic_score) AS first_message_index,
                      argMax(last_message_index, semantic_score)  AS last_message_index,
                      max(semantic_score)                         AS relevance_score,
                      count() AS row_count
                    FROM (
                      SELECT
                        chunk_index,
                        first_message_index,
                        last_message_index,
                        (1 - cosineDistance(embedding, {queryEmbedding:Array(Float32)})) AS semantic_score
                      FROM trace_search_embeddings
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND trace_id = {traceId:FixedString(32)}
                    )`,
            query_params: {
              organizationId: args.organizationId as string,
              projectId: args.projectId as string,
              traceId: args.traceId,
              queryEmbedding: [...args.queryEmbedding],
            },
            format: "JSONEachRow",
          })

          const [row] = await result.json<{
            chunk_index: number
            first_message_index: number | null
            last_message_index: number | null
            relevance_score: number
            row_count: string | number
          }>()

          // `count()` is UInt64 — comes back as a String over JSONEachRow
          // today, but Number() is defensive against driver/output-format
          // changes (Copilot review on #3257).
          if (!row || Number(row.row_count) === 0) return null

          return {
            chunkIndex: row.chunk_index,
            firstMessageIndex: row.first_message_index,
            lastMessageIndex: row.last_message_index,
            relevanceScore: row.relevance_score,
          }
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "findSemanticHighlightForTrace")))

    const findSharedSemanticHighlightForTrace: TraceSearchRepositoryShape["findSemanticHighlightForTrace"] = (args) =>
      chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT
                      argMax(o.message_index, semantic_score) AS message_index,
                      max(semantic_score)                     AS relevance_score,
                      count() AS row_count
                    FROM trace_message_occurrences AS o
                    INNER JOIN (
                      SELECT
                        content_hash,
                        (1 - cosineDistance(embedding, {queryEmbedding:Array(Float32)})) AS semantic_score
                      FROM message_embeddings
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                    ) AS e ON o.content_hash = e.content_hash
                    WHERE o.organization_id = {organizationId:String}
                      AND o.project_id = {projectId:String}
                      AND o.trace_id = {traceId:FixedString(32)}`,
            query_params: {
              organizationId: args.organizationId as string,
              projectId: args.projectId as string,
              traceId: args.traceId,
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
        .pipe(Effect.mapError((error) => toRepositoryError(error, "findSharedSemanticHighlightForTrace")))

    const findSemanticHighlightForTrace: TraceSearchRepositoryShape["findSemanticHighlightForTrace"] = (args) =>
      useSharedMessageEmbeddingsReads()
        ? findSharedSemanticHighlightForTrace(args).pipe(
            Effect.flatMap((result) => (result ? Effect.succeed(result) : findLegacySemanticHighlightForTrace(args))),
          )
        : findLegacySemanticHighlightForTrace(args)

    return {
      upsertDocument,
      upsertEmbedding,
      upsertMessageOccurrences,
      hasEmbeddingWithHash,
      findSemanticHighlightForTrace,
    } satisfies TraceSearchRepositoryShape
  }),
)
