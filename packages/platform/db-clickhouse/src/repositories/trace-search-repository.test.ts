import { SessionId } from "@domain/shared"
import { OrganizationId, ProjectId, SEED_ORG_ID, SEED_PROJECT_ID, TraceId } from "@domain/shared/seeding"
import {
  MessageEmbeddingRepository,
  type MessageEmbeddingRepositoryShape,
  TRACE_SEARCH_EMBEDDING_DIMENSIONS,
  TRACE_SEARCH_EMBEDDING_MODEL,
  TraceSearchRepository,
  type TraceSearchRepositoryShape,
} from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect, Layer } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { MessageEmbeddingRepositoryLive } from "./message-embedding-repository.ts"
import { TraceSearchRepositoryLive } from "./trace-search-repository.ts"

const ORG_ID = OrganizationId(SEED_ORG_ID)
const PROJECT_ID = ProjectId(SEED_PROJECT_ID)
const TEST_TRACE_ID = TraceId("a".repeat(32)) // 32-char trace ID

// setupTestClickHouse registers a beforeEach that TRUNCATEs every user table,
// so tests start with clean trace_search_documents / trace_search_embeddings.
const ch = setupTestClickHouse()

describe("TraceSearchRepository", () => {
  let repo: TraceSearchRepositoryShape
  let messageEmbeddingRepo: MessageEmbeddingRepositoryShape

  beforeAll(async () => {
    const repositories = await Effect.runPromise(
      Effect.gen(function* () {
        return {
          traceSearch: yield* TraceSearchRepository,
          messageEmbeddings: yield* MessageEmbeddingRepository,
        }
      }).pipe(
        withClickHouse(Layer.mergeAll(TraceSearchRepositoryLive, MessageEmbeddingRepositoryLive), ch.client, ORG_ID),
      ),
    )
    repo = repositories.traceSearch
    messageEmbeddingRepo = repositories.messageEmbeddings
  })

  beforeEach(() => {
    delete process.env.LAT_TRACE_SEARCH_SHARED_MESSAGE_EMBEDDINGS_READS
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

  describe("upsertMessageOccurrences", () => {
    it("should upsert occurrence rows", async () => {
      const result = await Effect.runPromise(
        repo.upsertMessageOccurrences([
          {
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            traceId: TEST_TRACE_ID,
            messageIndex: 3,
            contentHash: "message-hash",
            sessionId: SessionId("session-1"),
            startTime: new Date(),
            role: "assistant",
            isOutput: true,
          },
        ]),
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

    it("uses message occurrences for highlights when shared-message reads are enabled", async () => {
      process.env.LAT_TRACE_SEARCH_SHARED_MESSAGE_EMBEDDINGS_READS = "true"

      await Effect.runPromise(
        messageEmbeddingRepo.upsertMany([
          {
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            contentHash: "shared-message-hash",
            embedding: basisVector(0),
            embeddingModel: TRACE_SEARCH_EMBEDDING_MODEL,
          },
        ]),
      )
      await Effect.runPromise(
        repo.upsertMessageOccurrences([
          {
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            traceId: TEST_TRACE_ID,
            messageIndex: 5,
            contentHash: "shared-message-hash",
            sessionId: SessionId("session-1"),
            startTime: new Date(),
            role: "assistant",
            isOutput: true,
          },
        ]),
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
      expect(result?.chunkIndex).toBe(5)
      expect(result?.firstMessageIndex).toBe(5)
      expect(result?.lastMessageIndex).toBe(5)
      expect(result?.relevanceScore).toBeCloseTo(1, 6)
    })

    it("ignores shared message embeddings from other models", async () => {
      process.env.LAT_TRACE_SEARCH_SHARED_MESSAGE_EMBEDDINGS_READS = "true"

      await Effect.runPromise(
        messageEmbeddingRepo.upsertMany([
          {
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            contentHash: "other-model-message-hash",
            embedding: basisVector(0),
            embeddingModel: "older-embedding-model",
          },
        ]),
      )
      await Effect.runPromise(
        repo.upsertMessageOccurrences([
          {
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            traceId: TEST_TRACE_ID,
            messageIndex: 5,
            contentHash: "other-model-message-hash",
            sessionId: SessionId("session-1"),
            startTime: new Date(),
            role: "assistant",
            isOutput: true,
          },
        ]),
      )

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

    it("ignores stale occurrence hashes after a trace message is refreshed", async () => {
      process.env.LAT_TRACE_SEARCH_SHARED_MESSAGE_EMBEDDINGS_READS = "true"

      await Effect.runPromise(
        messageEmbeddingRepo.upsertMany([
          {
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            contentHash: "stale-message-hash",
            embedding: basisVector(0),
            embeddingModel: TRACE_SEARCH_EMBEDDING_MODEL,
          },
        ]),
      )

      await ch.client.insert({
        table: "trace_message_occurrences",
        values: [
          {
            organization_id: ORG_ID as string,
            project_id: PROJECT_ID as string,
            trace_id: TEST_TRACE_ID,
            message_index: 5,
            content_hash: "stale-message-hash",
            session_id: "session-1",
            start_time: "2026-01-01 00:00:00.000000000",
            role: "assistant",
            is_output: 1,
            indexed_at: "2026-01-01 00:00:00.000",
          },
          {
            organization_id: ORG_ID as string,
            project_id: PROJECT_ID as string,
            trace_id: TEST_TRACE_ID,
            message_index: 5,
            content_hash: "refreshed-message-hash",
            session_id: "session-1",
            start_time: "2026-01-01 00:00:00.000000000",
            role: "assistant",
            is_output: 1,
            indexed_at: "2026-01-01 00:00:01.000",
          },
        ],
        format: "JSONEachRow",
      })

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

    it("ignores system message occurrences when shared-message reads are enabled", async () => {
      process.env.LAT_TRACE_SEARCH_SHARED_MESSAGE_EMBEDDINGS_READS = "true"

      await Effect.runPromise(
        messageEmbeddingRepo.upsertMany([
          {
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            contentHash: "system-message-hash",
            embedding: basisVector(0),
            embeddingModel: TRACE_SEARCH_EMBEDDING_MODEL,
          },
        ]),
      )
      await Effect.runPromise(
        repo.upsertMessageOccurrences([
          {
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            traceId: TEST_TRACE_ID,
            messageIndex: 0,
            contentHash: "system-message-hash",
            sessionId: SessionId("session-1"),
            startTime: new Date(),
            role: "system",
            isOutput: false,
          },
        ]),
      )

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
  })
})
