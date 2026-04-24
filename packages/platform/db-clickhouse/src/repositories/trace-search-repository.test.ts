import { OrganizationId, ProjectId, SEED_ORG_ID, SEED_PROJECT_ID, TraceId } from "@domain/shared/seeding"
import {
  TRACE_SEARCH_EMBEDDING_DIMENSIONS,
  TRACE_SEARCH_EMBEDDING_MODEL,
  TraceSearchRepository,
  type TraceSearchRepositoryShape,
} from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { TraceSearchRepositoryLive } from "./trace-search-repository.ts"

const ORG_ID = OrganizationId(SEED_ORG_ID)
const PROJECT_ID = ProjectId(SEED_PROJECT_ID)
const TEST_TRACE_ID = TraceId("a".repeat(32)) // 32-char trace ID

// setupTestClickHouse registers a beforeEach that TRUNCATEs every user table,
// so tests start with clean trace_search_documents / trace_search_embeddings.
const ch = setupTestClickHouse()

describe("TraceSearchRepository", () => {
  let repo: TraceSearchRepositoryShape

  beforeAll(async () => {
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* TraceSearchRepository
      }).pipe(withClickHouse(TraceSearchRepositoryLive, ch.client, ORG_ID)),
    )
  })

  describe("upsertDocument", () => {
    it("should upsert a lexical search document", async () => {
      const result = await Effect.runPromise(
        repo.upsertDocument({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TEST_TRACE_ID,
          startTime: new Date(),
          rootSpanName: "test-span",
          searchText: "user query and assistant response content",
          contentHash: "abc123".repeat(8), // 48 chars -> padded to 64
        }),
      )

      expect(result).toBeUndefined()
    })
  })

  describe("upsertEmbedding", () => {
    it("should upsert an embedding", async () => {
      const result = await Effect.runPromise(
        repo.upsertEmbedding({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TEST_TRACE_ID,
          startTime: new Date(),
          contentHash: "abc123".repeat(8),
          embeddingModel: TRACE_SEARCH_EMBEDDING_MODEL,
          embedding: new Array(TRACE_SEARCH_EMBEDDING_DIMENSIONS).fill(0.1),
        }),
      )

      expect(result).toBeUndefined()
    })
  })

  describe("hasEmbeddingWithHash", () => {
    it("should return false when no embedding exists", async () => {
      const result = await Effect.runPromise(
        repo.hasEmbeddingWithHash(ORG_ID, PROJECT_ID, TEST_TRACE_ID, "nonexistenthash"),
      )

      expect(result).toBe(false)
    })

    it("should return true when embedding with matching hash exists", async () => {
      const contentHash = "hash123".repeat(8)

      // First insert an embedding
      await Effect.runPromise(
        repo.upsertEmbedding({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TEST_TRACE_ID,
          startTime: new Date(),
          contentHash,
          embeddingModel: TRACE_SEARCH_EMBEDDING_MODEL,
          embedding: new Array(TRACE_SEARCH_EMBEDDING_DIMENSIONS).fill(0.1),
        }),
      )

      const result = await Effect.runPromise(repo.hasEmbeddingWithHash(ORG_ID, PROJECT_ID, TEST_TRACE_ID, contentHash))

      expect(result).toBe(true)
    })
  })
})
