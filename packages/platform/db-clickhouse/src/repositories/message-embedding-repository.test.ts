import { DEFAULT_EMBEDDING_CONFIG, EMBEDDING_DIMENSIONS } from "@domain/ai"
import { OrganizationId, ProjectId, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import { MessageEmbeddingRepository, type MessageEmbeddingRepositoryShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { MessageEmbeddingRepositoryLive } from "./message-embedding-repository.ts"

const ORG_ID = OrganizationId(SEED_ORG_ID)
const PROJECT_ID = ProjectId(SEED_PROJECT_ID)

const ch = setupTestClickHouse()

const EMBEDDING_MODEL = DEFAULT_EMBEDDING_CONFIG.model
const embedding = (value: number) => new Array(EMBEDDING_DIMENSIONS).fill(value)

describe("MessageEmbeddingRepository", () => {
  let repo: MessageEmbeddingRepositoryShape

  beforeAll(async () => {
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* MessageEmbeddingRepository
      }).pipe(withClickHouse(MessageEmbeddingRepositoryLive, ch.client, ORG_ID)),
    )
  })

  it("returns no rows for an empty hash set", async () => {
    const rows = await Effect.runPromise(
      repo.findByHashes({ organizationId: ORG_ID, projectId: PROJECT_ID, contentHashes: [] }),
    )

    expect(rows).toEqual([])
  })

  it("inserts and batch fetches embeddings by content hash", async () => {
    const contentHashA = "hash-a"
    const contentHashB = "hash-b"
    const insertedAt = new Date("2026-06-10T09:00:00.000Z")

    await Effect.runPromise(
      repo.upsertMany([
        {
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          contentHash: contentHashA,
          embedding: embedding(0.1),
          embeddingModel: EMBEDDING_MODEL,
          insertedAt,
        },
        {
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          contentHash: contentHashB,
          embedding: embedding(0.2),
          embeddingModel: EMBEDDING_MODEL,
          insertedAt,
        },
      ]),
    )

    const rows = await Effect.runPromise(
      repo.findByHashes({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        contentHashes: [contentHashA, contentHashA, "missing"],
      }),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.contentHash).toBe(contentHashA)
    expect(rows[0]?.embeddingModel).toBe(EMBEDDING_MODEL)
    expect(rows[0]?.embedding).toEqual(embedding(0.1))
    expect(rows[0]?.insertedAt.toISOString()).toBe(insertedAt.toISOString())
  })

  it("leaves an existing embedding untouched when the same hash/model is inserted again", async () => {
    const contentHash = "hash-immutable"
    const first = new Date("2026-06-10T09:00:00.000Z")
    const second = new Date("2026-06-10T10:00:00.000Z")

    await Effect.runPromise(
      repo.upsertMany([
        {
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          contentHash,
          embedding: embedding(0.1),
          embeddingModel: EMBEDDING_MODEL,
          insertedAt: first,
        },
      ]),
    )

    await Effect.runPromise(
      repo.upsertMany([
        {
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          contentHash,
          embedding: embedding(0.3),
          embeddingModel: EMBEDDING_MODEL,
          insertedAt: second,
        },
      ]),
    )

    const rows = await Effect.runPromise(
      repo.findByHashes({ organizationId: ORG_ID, projectId: PROJECT_ID, contentHashes: [contentHash] }),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.embedding).toEqual(embedding(0.1))
    expect(rows[0]?.insertedAt.toISOString()).toBe(first.toISOString())
  })
})
