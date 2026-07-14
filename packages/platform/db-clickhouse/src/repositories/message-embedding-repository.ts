import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape, OrganizationId, ProjectId, toRepositoryError } from "@domain/shared"
import {
  MessageEmbeddingRepository,
  type MessageEmbeddingRepositoryShape,
  type MessageEmbeddingUpsert,
} from "@domain/spans"
import { formatCHDate, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"

type MessageEmbeddingRow = {
  readonly organization_id: string
  readonly project_id: string
  readonly content_hash: string
  readonly embedding: readonly number[]
  readonly embedding_model: string
  readonly inserted_at: string
}

const toDomain = (row: MessageEmbeddingRow) => ({
  organizationId: OrganizationId(row.organization_id),
  projectId: ProjectId(row.project_id),
  contentHash: row.content_hash,
  embedding: row.embedding,
  embeddingModel: row.embedding_model,
  insertedAt: parseCHDate(row.inserted_at),
})

const keyOf = (row: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly contentHash: string
  readonly embeddingModel: string
}): string => `${row.organizationId}\0${row.projectId}\0${row.embeddingModel}\0${row.contentHash}`

const scopeOf = (row: { readonly organizationId: OrganizationId; readonly projectId: ProjectId }): string =>
  `${row.organizationId}\0${row.projectId}`

export const MessageEmbeddingRepositoryLive = Layer.effect(
  MessageEmbeddingRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    const findByHashes: MessageEmbeddingRepositoryShape["findByHashes"] = (args) => {
      const contentHashes = [...new Set(args.contentHashes)]
      if (contentHashes.length === 0) return Effect.succeed([])

      const modelFilter = args.embeddingModel ? "AND embedding_model = {embeddingModel:String}" : ""

      return chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT
                      organization_id,
                      project_id,
                      content_hash,
                      embedding,
                      embedding_model,
                      inserted_at
                    FROM message_embeddings
                    WHERE organization_id = {organizationId:String}
                      AND project_id = {projectId:String}
                      ${modelFilter}
                      AND content_hash IN {contentHashes:Array(String)}
                    ORDER BY content_hash ASC, embedding_model ASC`,
            query_params: {
              organizationId: args.organizationId as string,
              projectId: args.projectId as string,
              contentHashes,
              ...(args.embeddingModel ? { embeddingModel: args.embeddingModel } : {}),
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

      const uniqueRows = [...new Map(rows.map((row) => [keyOf(row), row] as const)).values()]
      const rowsByScope = new Map<string, typeof uniqueRows>()
      for (const row of uniqueRows) {
        const scope = scopeOf(row)
        rowsByScope.set(scope, [...(rowsByScope.get(scope) ?? []), row])
      }

      return chSqlClient
        .query(async (client) => {
          const rowsToInsert: MessageEmbeddingUpsert[] = []
          for (const scopedRows of rowsByScope.values()) {
            const [first] = scopedRows
            if (!first) continue

            const result = await client.query({
              query: `SELECT
                        content_hash,
                        embedding_model
                      FROM message_embeddings
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND embedding_model IN {embeddingModels:Array(String)}
                        AND content_hash IN {contentHashes:Array(String)}`,
              query_params: {
                organizationId: first.organizationId as string,
                projectId: first.projectId as string,
                embeddingModels: [...new Set(scopedRows.map((row) => row.embeddingModel))],
                contentHashes: [...new Set(scopedRows.map((row) => row.contentHash))],
              },
              format: "JSONEachRow",
            })
            const existingRows = await result.json<{ content_hash: string; embedding_model: string }>()
            const existing = new Set(
              existingRows.map(
                (row) => `${first.organizationId}\0${first.projectId}\0${row.embedding_model}\0${row.content_hash}`,
              ),
            )
            rowsToInsert.push(...scopedRows.filter((row) => !existing.has(keyOf(row))))
          }

          if (rowsToInsert.length === 0) return

          await client.insert({
            table: "message_embeddings",
            values: rowsToInsert.map((row) => ({
              organization_id: row.organizationId as string,
              project_id: row.projectId as string,
              content_hash: row.contentHash,
              embedding: [...row.embedding],
              embedding_model: row.embeddingModel,
              inserted_at: formatCHDate(row.insertedAt ?? new Date()),
            })),
            format: "JSONEachRow",
            // Buffer concurrent small embedding batches into fewer ClickHouse parts.
            clickhouse_settings: {
              async_insert: 1,
              wait_for_async_insert: 1,
            },
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
