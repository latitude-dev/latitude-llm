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
          chunkIndex: 0,
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
        repo.hasEmbeddingWithHash(ORG_ID, PROJECT_ID, TEST_TRACE_ID, 0, "nonexistenthash"),
      )

      expect(result).toBe(false)
    })

    it("should return true when an embedding row matches trace + chunk_index + hash", async () => {
      const contentHash = "hash123".repeat(8)

      await Effect.runPromise(
        repo.upsertEmbedding({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TEST_TRACE_ID,
          chunkIndex: 2,
          startTime: new Date(),
          contentHash,
          embeddingModel: TRACE_SEARCH_EMBEDDING_MODEL,
          embedding: new Array(TRACE_SEARCH_EMBEDDING_DIMENSIONS).fill(0.1),
        }),
      )

      // Same chunk + hash → match.
      expect(
        await Effect.runPromise(repo.hasEmbeddingWithHash(ORG_ID, PROJECT_ID, TEST_TRACE_ID, 2, contentHash)),
      ).toBe(true)
      // Same hash but different chunk_index → no match (each chunk dedupes
      // independently).
      expect(
        await Effect.runPromise(repo.hasEmbeddingWithHash(ORG_ID, PROJECT_ID, TEST_TRACE_ID, 0, contentHash)),
      ).toBe(false)
    })
  })

  describe("findSemanticHighlightForTrace", () => {
    // Unit basis vectors → cosineDistance(e_i, e_j) = 1 for i!=j, 0 for i==j.
    // So `semantic_score = 1 - cosineDistance` is 1.0 for the aligned chunk
    // and 0.0 for any orthogonal chunk.
    const basisVector = (oneAt: number): number[] => {
      const v = new Array(TRACE_SEARCH_EMBEDDING_DIMENSIONS).fill(0)
      v[oneAt] = 1
      return v
    }

    it("returns null when the trace has no chunk rows", async () => {
      const result = await Effect.runPromise(
        repo.findSemanticHighlightForTrace({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TEST_TRACE_ID,
          queryEmbedding: basisVector(0),
        }),
      )

      expect(result).toBeNull()
    })

    it("argMax selects the chunk with the highest cosine score and surfaces its message range", async () => {
      const startTime = new Date()

      // Two chunks against the SAME trace. Chunk 0's embedding is aligned
      // with the query (score 1.0); chunk 1 is orthogonal (score 0.0).
      await Effect.runPromise(
        repo.upsertEmbedding({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TEST_TRACE_ID,
          chunkIndex: 0,
          startTime,
          contentHash: "c0".repeat(32),
          embeddingModel: TRACE_SEARCH_EMBEDDING_MODEL,
          embedding: basisVector(0),
          firstMessageIndex: 4,
          lastMessageIndex: 7,
        }),
      )
      await Effect.runPromise(
        repo.upsertEmbedding({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TEST_TRACE_ID,
          chunkIndex: 1,
          startTime,
          contentHash: "c1".repeat(32),
          embeddingModel: TRACE_SEARCH_EMBEDDING_MODEL,
          embedding: basisVector(1),
          firstMessageIndex: 12,
          lastMessageIndex: 14,
        }),
      )

      const result = await Effect.runPromise(
        repo.findSemanticHighlightForTrace({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TEST_TRACE_ID,
          queryEmbedding: basisVector(0),
        }),
      )

      expect(result).not.toBeNull()
      expect(result?.chunkIndex).toBe(0)
      expect(result?.firstMessageIndex).toBe(4)
      expect(result?.lastMessageIndex).toBe(7)
      expect(result?.relevanceScore).toBeCloseTo(1, 6)
    })

    it("returns NULL message-range columns for pre-migration chunks (rollout parity)", async () => {
      await Effect.runPromise(
        repo.upsertEmbedding({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TEST_TRACE_ID,
          chunkIndex: 0,
          startTime: new Date(),
          contentHash: "legacy".repeat(8).slice(0, 64),
          embeddingModel: TRACE_SEARCH_EMBEDDING_MODEL,
          embedding: basisVector(0),
        }),
      )

      const result = await Effect.runPromise(
        repo.findSemanticHighlightForTrace({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TEST_TRACE_ID,
          queryEmbedding: basisVector(0),
        }),
      )

      expect(result).not.toBeNull()
      expect(result?.chunkIndex).toBe(0)
      expect(result?.firstMessageIndex).toBeNull()
      expect(result?.lastMessageIndex).toBeNull()
    })
  })
})
