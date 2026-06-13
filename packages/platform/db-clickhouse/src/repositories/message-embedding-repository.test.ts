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

  it("upserts and batch fetches embeddings by content hash", async () => {
    const contentHashA = "hash-a"
    const contentHashB = "hash-b"
    const lastSeenAt = new Date("2026-06-10T09:00:00.000Z")

    await Effect.runPromise(
      repo.upsertMany([
        {
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          contentHash: contentHashA,
          embedding: embedding(0.1),
          embeddingModel: EMBEDDING_MODEL,
          lastSeenAt,
        },
        {
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          contentHash: contentHashB,
          embedding: embedding(0.2),
          embeddingModel: EMBEDDING_MODEL,
          lastSeenAt,
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
    expect(rows[0]?.lastSeenAt.toISOString()).toBe(lastSeenAt.toISOString())
  })

  it("returns the newest version when a hash has multiple unmerged rows", async () => {
    const contentHash = "hash-versioned"
    const older = new Date("2026-06-10T09:00:00.000Z")
    const newer = new Date("2026-06-10T10:00:00.000Z")

    await Effect.runPromise(
      repo.upsertMany([
        {
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          contentHash,
          embedding: embedding(0.1),
          embeddingModel: EMBEDDING_MODEL,
          lastSeenAt: older,
        },
        {
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          contentHash,
          embedding: embedding(0.3),
          embeddingModel: EMBEDDING_MODEL,
          lastSeenAt: newer,
        },
      ]),
    )

    const rows = await Effect.runPromise(
      repo.findByHashes({ organizationId: ORG_ID, projectId: PROJECT_ID, contentHashes: [contentHash] }),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.embedding).toEqual(embedding(0.3))
    expect(rows[0]?.lastSeenAt.toISOString()).toBe(newer.toISOString())
  })
})
