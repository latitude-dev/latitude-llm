import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { TraceSearchRepository, type TraceSearchRepositoryShape } from "@domain/spans"
import { hash, normalizeCHString, parseCHDate } from "@repo/utils"
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

    const refreshSessionDocument: TraceSearchRepositoryShape["refreshSessionDocument"] = ({
      organizationId,
      projectId,
      sessionId,
      retentionDays,
    }) =>
      Effect.gen(function* () {
        const rows = yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `WITH trace_sessions AS (
                        SELECT
                          trace_id,
                          coalesce(
                            nullIf(argMaxIfMerge(session_id), ''),
                            toString(trace_id)
                          ) AS session_id
                        FROM traces
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                        GROUP BY trace_id
                      )
                      SELECT
                        CAST(d.trace_id AS String) AS trace_id,
                        d.start_time AS start_time,
                        d.root_span_name AS root_span_name,
                        d.search_text AS search_text,
                        d.content_hash AS content_hash
                      FROM trace_search_documents AS d FINAL
                      INNER JOIN trace_sessions AS ts ON d.trace_id = ts.trace_id
                      WHERE d.organization_id = {organizationId:String}
                        AND d.project_id = {projectId:String}
                        AND ts.session_id = {sessionId:String}
                      ORDER BY d.start_time ASC, d.trace_id ASC`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                sessionId: sessionId as string,
              },
              format: "JSONEachRow",
            })
            return result.json<{
              trace_id: string
              start_time: string
              root_span_name: string
              search_text: string
              content_hash: string
            }>()
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "refreshSessionDocument.select")))

        if (rows.length === 0) return

        const searchText = rows
          .map((row) => normalizeCHString(row.search_text).trim())
          .filter((text) => text.length > 0)
          .join("\n\n")
        const contentHash = yield* hash(
          `${sessionId}\0${rows.map((row) => normalizeCHString(row.content_hash)).join("\0")}\0${searchText}`,
        ).pipe(Effect.mapError((error) => toRepositoryError(error, "refreshSessionDocument.hash")))
        const first = rows[0]

        yield* chSqlClient
          .query(async (client) => {
            await client.insert({
              table: "session_search_documents",
              values: [
                {
                  organization_id: organizationId as string,
                  project_id: projectId as string,
                  session_id: sessionId as string,
                  start_time: toClickhouseDateTime(parseCHDate(first?.start_time ?? new Date().toISOString())),
                  trace_ids: rows.map((row) => normalizeCHString(row.trace_id)),
                  root_span_name: normalizeCHString(first?.root_span_name ?? ""),
                  search_text: searchText,
                  content_hash: contentHash,
                  retention_days: retentionDays ?? 90,
                  indexed_at: toClickhouseDateTime(new Date()),
                },
              ],
              format: "JSONEachRow",
            })
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "refreshSessionDocument.insert")))
      })

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

    const findSemanticHighlightForTrace: TraceSearchRepositoryShape["findSemanticHighlightForTrace"] = (args) =>
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

    return {
      upsertDocument,
      refreshSessionDocument,
      upsertEmbedding,
      hasEmbeddingWithHash,
      findSemanticHighlightForTrace,
    } satisfies TraceSearchRepositoryShape
  }),
)
