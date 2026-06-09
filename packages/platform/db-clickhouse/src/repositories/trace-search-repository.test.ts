import { OrganizationId, ProjectId, SEED_ORG_ID, SEED_PROJECT_ID, SessionId, TraceId } from "@domain/shared/seeding"
import {
  TRACE_SEARCH_EMBEDDING_DIMENSIONS,
  TRACE_SEARCH_EMBEDDING_MODEL,
  TraceSearchRepository,
  type TraceSearchRepositoryShape,
} from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { insertJsonEachRow } from "../sql.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { TraceSearchRepositoryLive } from "./trace-search-repository.ts"

const ORG_ID = OrganizationId(SEED_ORG_ID)
const PROJECT_ID = ProjectId(SEED_PROJECT_ID)
const TEST_TRACE_ID = TraceId("a".repeat(32)) // 32-char trace ID
const toClickHouseDateTime = (value: Date) => value.toISOString().replace("T", " ").replace("Z", "")

// setupTestClickHouse registers a beforeEach that TRUNCATEs every user table,
// so tests start with clean trace_search_documents / trace_search_embeddings.
const ch = setupTestClickHouse()

const makeSpanRow = ({
  traceId,
  spanId,
  sessionId,
  startTime,
}: {
  readonly traceId: string
  readonly spanId: string
  readonly sessionId: string
  readonly startTime: Date
}): SpanRow => ({
  organization_id: ORG_ID as string,
  project_id: PROJECT_ID as string,
  session_id: sessionId,
  user_id: "",
  trace_id: traceId,
  span_id: spanId,
  parent_span_id: "",
  api_key_id: "test-api-key",
  simulation_id: "",
  start_time: toClickHouseDateTime(startTime),
  end_time: toClickHouseDateTime(new Date(startTime.getTime() + 1_000)),
  name: "root",
  service_name: "test-service",
  kind: 0,
  status_code: 0,
  status_message: "",
  error_type: "",
  tags: [],
  metadata: {},
  operation: "",
  provider: "",
  model: "",
  response_model: "",
  tokens_input: 0,
  tokens_output: 0,
  tokens_cache_read: 0,
  tokens_cache_create: 0,
  tokens_reasoning: 0,
  cost_input_microcents: 0,
  cost_output_microcents: 0,
  cost_total_microcents: 0,
  cost_is_estimated: 0,
  time_to_first_token_ns: 0,
  is_streaming: 0,
  response_id: "",
  finish_reasons: [],
  input_messages: "",
  output_messages: "",
  system_instructions: "",
  tool_definitions: "",
  tool_call_id: "",
  tool_name: "",
  tool_input: "",
  tool_output: "",
  attr_string: {},
  attr_int: {},
  attr_float: {},
  attr_bool: {},
  resource_string: {},
  scope_name: "",
  scope_version: "",
})

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

  describe("refreshSessionDocument", () => {
    it("rebuilds one lexical document from all trace documents in a session", async () => {
      const sessionId = SessionId("session-lexical-doc")
      const traceA = TraceId("a".repeat(32))
      const traceB = TraceId("b".repeat(32))
      const start = new Date(Date.UTC(2026, 0, 1, 10, 0, 0))

      await Effect.runPromise(
        insertJsonEachRow(ch.client, "spans", [
          makeSpanRow({ traceId: traceA, spanId: "1".repeat(16), sessionId, startTime: start }),
          makeSpanRow({
            traceId: traceB,
            spanId: "2".repeat(16),
            sessionId,
            startTime: new Date(start.getTime() + 1_000),
          }),
        ]),
      )
      await Effect.runPromise(
        repo.upsertDocument({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: traceA,
          startTime: start,
          rootSpanName: "root-a",
          searchText: "first trace text",
          contentHash: "a".repeat(64),
        }),
      )
      await Effect.runPromise(
        repo.upsertDocument({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: traceB,
          startTime: new Date(start.getTime() + 1_000),
          rootSpanName: "root-b",
          searchText: "second trace text",
          contentHash: "b".repeat(64),
        }),
      )

      await Effect.runPromise(
        repo.refreshSessionDocument({ organizationId: ORG_ID, projectId: PROJECT_ID, sessionId, retentionDays: 42 }),
      )

      const result = await ch.client.query({
        query: `SELECT
                  session_id,
                  CAST(trace_ids AS Array(String)) AS trace_ids,
                  root_span_name,
                  search_text,
                  retention_days
                FROM session_search_documents FINAL
                WHERE organization_id = {organizationId:String}
                  AND project_id = {projectId:String}
                  AND session_id = {sessionId:String}`,
        query_params: { organizationId: ORG_ID as string, projectId: PROJECT_ID as string, sessionId },
        format: "JSONEachRow",
      })
      const rows = await result.json<{
        session_id: string
        trace_ids: string[]
        root_span_name: string
        search_text: string
        retention_days: number
      }>()

      expect(rows).toHaveLength(1)
      expect(rows[0]?.trace_ids).toEqual([traceA, traceB])
      expect(rows[0]?.root_span_name).toBe("root-a")
      expect(rows[0]?.search_text).toBe("first trace text\n\nsecond trace text")
      expect(rows[0]?.retention_days).toBe(42)
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
