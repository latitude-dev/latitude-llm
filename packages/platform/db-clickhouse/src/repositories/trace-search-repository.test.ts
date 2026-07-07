import { DEFAULT_EMBEDDING_CONFIG, EMBEDDING_DIMENSIONS } from "@domain/ai"
import { SessionId } from "@domain/shared"
import { OrganizationId, ProjectId, SEED_ORG_ID, SEED_PROJECT_ID, TraceId } from "@domain/shared/seeding"
import {
  MessageEmbeddingRepository,
  type MessageEmbeddingRepositoryShape,
  TraceSearchRepository,
  type TraceSearchRepositoryShape,
} from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect, Layer } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { MessageEmbeddingRepositoryLive } from "./message-embedding-repository.ts"
import { TraceSearchRepositoryLive } from "./trace-search-repository.ts"

const ORG_ID = OrganizationId(SEED_ORG_ID)
const PROJECT_ID = ProjectId(SEED_PROJECT_ID)
const TEST_TRACE_ID = TraceId("a".repeat(32)) // 32-char trace ID

// setupTestClickHouse registers a beforeEach that TRUNCATEs every user table.
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

  describe("findSemanticHighlightForTrace", () => {
    // Unit basis vectors → cosineDistance(e_i, e_j) = 1 for i!=j, 0 for i==j.
    // So `semantic_score = 1 - cosineDistance` is 1.0 for the aligned chunk
    // and 0.0 for any orthogonal chunk.
    const basisVector = (oneAt: number): number[] => {
      const v = new Array(EMBEDDING_DIMENSIONS).fill(0)
      v[oneAt] = 1
      return v
    }

    it("returns null when the trace has no message occurrence rows", async () => {
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

    it("uses message occurrences for highlights", async () => {
      await Effect.runPromise(
        messageEmbeddingRepo.upsertMany([
          {
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            contentHash: "shared-message-hash",
            embedding: basisVector(0),
            embeddingModel: DEFAULT_EMBEDDING_CONFIG.model,
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
      await Effect.runPromise(
        messageEmbeddingRepo.upsertMany([
          {
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            contentHash: "stale-message-hash",
            embedding: basisVector(0),
            embeddingModel: DEFAULT_EMBEDDING_CONFIG.model,
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

    it("ignores system message occurrences", async () => {
      await Effect.runPromise(
        messageEmbeddingRepo.upsertMany([
          {
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            contentHash: "system-message-hash",
            embedding: basisVector(0),
            embeddingModel: DEFAULT_EMBEDDING_CONFIG.model,
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

    it("excludes boilerplate hashes shared across most traces from semantic scoring", async () => {
      // A vector at ~0.7 cosine similarity to basisVector(0): the unique
      // message scores below the boilerplate one, so it can only win the
      // argMax if the boilerplate hash is suppressed.
      const offAxisVector = (): number[] => {
        const v = new Array(EMBEDDING_DIMENSIONS).fill(0)
        v[0] = 0.7
        v[1] = Math.sqrt(1 - 0.49)
        return v
      }

      await Effect.runPromise(
        messageEmbeddingRepo.upsertMany([
          {
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            contentHash: "greeting-hash",
            embedding: basisVector(0),
            embeddingModel: DEFAULT_EMBEDDING_CONFIG.model,
          },
          {
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            contentHash: "unique-message-hash",
            embedding: offAxisVector(),
            embeddingModel: DEFAULT_EMBEDDING_CONFIG.model,
          },
        ]),
      )

      // The greeting hash occurs in 60 distinct traces — past the
      // greatest(TRACE_SEARCH_BOILERPLATE_MIN_TRACES, 20%-of-project)
      // document-frequency cut. The unique hash occurs once.
      const targetTraceId = TraceId("0".repeat(32))
      const boilerplateTraceIds = [
        targetTraceId,
        ...Array.from({ length: 59 }, (_, i) => TraceId((i + 1).toString(16).padStart(32, "0"))),
      ]
      await Effect.runPromise(
        repo.upsertMessageOccurrences([
          ...boilerplateTraceIds.map((traceId, i) => ({
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            traceId,
            messageIndex: 0,
            contentHash: "greeting-hash",
            sessionId: SessionId(`session-${i}`),
            startTime: new Date(),
            role: "assistant" as const,
            isOutput: false,
          })),
          {
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            traceId: targetTraceId,
            messageIndex: 3,
            contentHash: "unique-message-hash",
            sessionId: SessionId("session-0"),
            startTime: new Date(),
            role: "user",
            isOutput: false,
          },
        ]),
      )

      const result = await Effect.runPromise(
        repo.findSemanticHighlightForTrace({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: targetTraceId,
          queryEmbedding: basisVector(0),
        }),
      )

      // The greeting (score 1.0) is boilerplate-suppressed; the trace's
      // unique message (score ~0.7) defines the highlight instead.
      expect(result).not.toBeNull()
      expect(result?.firstMessageIndex).toBe(3)
      expect(result?.relevanceScore).toBeCloseTo(0.7, 3)
    })
  })
})
