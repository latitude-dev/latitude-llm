import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape, OrganizationId, ProjectId, toRepositoryError } from "@domain/shared"
import { MessageEmbeddingRepository, type MessageEmbeddingRepositoryShape } from "@domain/spans"
import { Effect, Layer } from "effect"

const toClickhouseDateTime = (date: Date): string => date.toISOString().replace("Z", "")
const parseClickhouseDate = (value: string): Date => new Date(`${value.replace(" ", "T")}Z`)

type MessageEmbeddingRow = {
  readonly organization_id: string
  readonly project_id: string
  readonly content_hash: string
  readonly embedding: readonly number[]
  readonly embedding_model: string
  readonly last_seen_at: string
}

const toDomain = (row: MessageEmbeddingRow) => ({
  organizationId: OrganizationId(row.organization_id),
  projectId: ProjectId(row.project_id),
  contentHash: row.content_hash,
  embedding: row.embedding,
  embeddingModel: row.embedding_model,
  lastSeenAt: parseClickhouseDate(row.last_seen_at),
})

export const MessageEmbeddingRepositoryLive = Layer.effect(
  MessageEmbeddingRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    const findByHashes: MessageEmbeddingRepositoryShape["findByHashes"] = (args) => {
      const contentHashes = [...new Set(args.contentHashes)]
      if (contentHashes.length === 0) return Effect.succeed([])

      return chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT
                      organization_id,
                      project_id,
                      content_hash,
                      embedding,
                      embedding_model,
                      last_seen_at
                    FROM message_embeddings
                    WHERE organization_id = {organizationId:String}
                      AND project_id = {projectId:String}
                      AND content_hash IN {contentHashes:Array(String)}
                    ORDER BY content_hash ASC, last_seen_at DESC
                    LIMIT 1 BY content_hash`,
            query_params: {
              organizationId: args.organizationId as string,
              projectId: args.projectId as string,
              contentHashes,
            },
            format: "JSONEachRow",
          })
          const rows = await result.json<MessageEmbeddingRow>()
          return rows.map(toDomain)
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "MessageEmbeddingRepository.findByHashes")))
    }

    const upsertMany: MessageEmbeddingRepositoryShape["upsertMany"] = (rows) => {
      if (rows.length === 0) return Effect.void

      return chSqlClient
        .query(async (client) => {
          await client.insert({
            table: "message_embeddings",
            values: rows.map((row) => ({
              organization_id: row.organizationId as string,
              project_id: row.projectId as string,
              content_hash: row.contentHash,
              embedding: [...row.embedding],
              embedding_model: row.embeddingModel,
              last_seen_at: toClickhouseDateTime(row.lastSeenAt ?? new Date()),
            })),
            format: "JSONEachRow",
          })
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "MessageEmbeddingRepository.upsertMany")))
    }

    return {
      findByHashes,
      upsertMany,
    } satisfies MessageEmbeddingRepositoryShape
  }),
)
