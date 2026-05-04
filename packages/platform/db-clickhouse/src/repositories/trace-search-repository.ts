import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { TraceSearchRepository, type TraceSearchRepositoryShape } from "@domain/spans"
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
                start_time: toClickhouseDateTime(row.startTime),
                content_hash: row.contentHash,
                embedding_model: row.embeddingModel,
                embedding: [...row.embedding],
                retention_days: row.retentionDays ?? 30,
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
      contentHash,
    ) =>
      chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT 1 FROM trace_search_embeddings
                    WHERE organization_id = {organizationId:String}
                      AND project_id = {projectId:String}
                      AND trace_id = {traceId:FixedString(32)}
                      AND content_hash = {contentHash:String}
                    LIMIT 1`,
            query_params: {
              organizationId: organizationId as string,
              projectId: projectId as string,
              traceId,
              contentHash,
            },
            format: "JSONEachRow",
          })
          const rows = await result.json<{ "1": number }[]>()
          return rows.length > 0
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "hasEmbeddingWithHash")))

    return {
      upsertDocument,
      upsertEmbedding,
      hasEmbeddingWithHash,
    } satisfies TraceSearchRepositoryShape
  }),
)
