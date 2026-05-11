import { AI, AIError, type AIShape } from "@domain/ai"
import type { ChSqlClient } from "@domain/shared"
import {
  bootstrapSeedScope,
  OrganizationId,
  ProjectId,
  SEED_ANNOTATION_DEMO_TRACE_ID,
  SEED_LIFECYCLE_TRACE_IDS,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  TraceId,
} from "@domain/shared/seeding"
import { TRACE_SEARCH_EMBEDDING_DIMENSIONS, TraceRepository, type TraceRepositoryShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect, Layer } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import { scoreSeeders } from "../seeds/scores/index.ts"
import { fixedTraceSeeders } from "../seeds/spans/fixed-traces.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { insertJsonEachRow } from "../sql.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { TraceRepositoryLive } from "./trace-repository.ts"

/** Mock AI layer that provides a fake embedding service for testing. */
const mockAILayer = Layer.succeed(AI, {
  generate: () => Effect.fail(new AIError({ message: "Generate not implemented in mock" })),
  embed: () => Effect.succeed({ embedding: new Array(TRACE_SEARCH_EMBEDDING_DIMENSIONS).fill(0.1) }),
  rerank: () => Effect.fail(new AIError({ message: "Rerank not implemented in mock" })),
} as AIShape)

const ORG_ID = OrganizationId(SEED_ORG_ID)
const PROJECT_ID = ProjectId(SEED_PROJECT_ID)
const TRACE_ID = SEED_LIFECYCLE_TRACE_IDS[0] as TraceId
const SCORED_TRACE_ID = SEED_LIFECYCLE_TRACE_IDS[3] as TraceId
const firstFixedTraceSeeder = fixedTraceSeeders[0]
const BASELINE_TEST_TAG = "baseline-missing-values"
const firstScoreSeeder = scoreSeeders[0]

if (firstFixedTraceSeeder === undefined) {
  throw new Error("Expected at least one fixed trace seeder")
}

function toClickHouseDateTime(value: Date): string {
  return value.toISOString().replace("T", " ").replace("Z", "")
}

function makeSpanRow({
  traceId,
  spanId,
  startTime,
  costTotalMicrocents,
  tokensInput,
  tokensOutput,
}: {
  readonly traceId: string
  readonly spanId: string
  readonly startTime: Date
  readonly costTotalMicrocents: number
  readonly tokensInput: number
  readonly tokensOutput: number
}): SpanRow {
  return {
    organization_id: ORG_ID,
    project_id: PROJECT_ID,
    session_id: "",
    user_id: "",
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: "",
    api_key_id: "test-api-key",
    simulation_id: "",
    start_time: toClickHouseDateTime(startTime),
    end_time: toClickHouseDateTime(new Date(startTime.getTime() + 1_000)),
    name: "baseline-test-span",
    service_name: "baseline-test-service",
    kind: 0,
    status_code: 0,
    status_message: "",
    error_type: "",
    tags: [BASELINE_TEST_TAG],
    metadata: {},
    operation: "",
    provider: "",
    model: "",
    response_model: "",
    tokens_input: tokensInput,
    tokens_output: tokensOutput,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 0,
    cost_output_microcents: costTotalMicrocents,
    cost_total_microcents: costTotalMicrocents,
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
  }
}

if (firstScoreSeeder === undefined) {
  throw new Error("Expected at least one score seeder")
}

const ch = setupTestClickHouse()

const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient | AI>) =>
  Effect.runPromise(effect.pipe(Effect.provide(mockAILayer), Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

describe("TraceRepository", () => {
  let repo: TraceRepositoryShape

  beforeAll(async () => {
    const combinedLayer = TraceRepositoryLive.pipe(Layer.provideMerge(mockAILayer))
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* TraceRepository
      }).pipe(withClickHouse(combinedLayer, ch.client, ORG_ID)),
    )
  })

  beforeEach(async () => {
    await Effect.runPromise(firstFixedTraceSeeder.run({ client: ch.client, scope: bootstrapSeedScope, quiet: true }))
    await Effect.runPromise(firstScoreSeeder.run({ client: ch.client, scope: bootstrapSeedScope, quiet: true }))
  })

  describe("matchesFiltersByTraceId", () => {
    it("returns true when the trace matches the canonical filter semantics", async () => {
      const matches = await runCh(
        repo.matchesFiltersByTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          filters: {
            tags: [{ op: "in", value: ["lifecycle"] }],
          },
        }),
      )

      expect(matches).toBe(true)
    })

    it("returns false when the trace does not match the filters", async () => {
      const matches = await runCh(
        repo.matchesFiltersByTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          filters: {
            tags: [{ op: "in", value: ["annotation"] }],
          },
        }),
      )

      expect(matches).toBe(false)
    })

    it("returns false for a missing trace id", async () => {
      const matches = await runCh(
        repo.matchesFiltersByTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: "ffffffffffffffffffffffffffffffff" as TraceId,
          filters: {
            tags: [{ op: "in", value: ["lifecycle"] }],
          },
        }),
      )

      expect(matches).toBe(false)
    })
  })

  describe("getCohortBaselineByTags", () => {
    it("ignores zero-filled cost and token values in percentile baselines", async () => {
      const rows = Array.from({ length: 10 }, (_value, index) => {
        const startTime = new Date(Date.UTC(2026, 0, 1, 0, 0, index))
        return makeSpanRow({
          traceId: `${index.toString(16).padStart(2, "0")}${"a".repeat(30)}`,
          spanId: `${index.toString(16).padStart(2, "0")}${"b".repeat(14)}`,
          startTime,
          costTotalMicrocents: index === 9 ? 500 : 0,
          tokensInput: index === 9 ? 100 : 0,
          tokensOutput: 0,
        })
      })

      await Effect.runPromise(insertJsonEachRow(ch.client, "spans", rows))

      const baseline = await runCh(
        repo.getCohortBaselineByTags({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          tags: [BASELINE_TEST_TAG],
        }),
      )

      expect(baseline.metrics.costTotalMicrocents.sampleCount).toBe(1)
      expect(baseline.metrics.costTotalMicrocents.p50).toBe(500)
      expect(baseline.metrics.costTotalMicrocents.p90).toBe(500)
      expect(baseline.metrics.durationNs.sampleCount).toBe(10)
      expect(baseline.metrics.durationNs.p50).toBe(1_000_000_000)
      expect(baseline.metrics.durationNs.p90).toBe(1_000_000_000)
      expect(baseline.metrics.tokensTotal.sampleCount).toBe(1)
      expect(baseline.metrics.tokensTotal.p50).toBe(100)
      expect(baseline.metrics.tokensTotal.p90).toBe(100)
    })

    it("isolates cohorts by exact tag combination, independent of order", async () => {
      const makeRowWithTags = (traceIdx: number, cost: number, tags: readonly string[]): SpanRow => {
        const startTime = new Date(Date.UTC(2026, 0, 2, 0, 0, traceIdx))
        const row = makeSpanRow({
          traceId: `${traceIdx.toString(16).padStart(2, "0")}${"c".repeat(30)}`,
          spanId: `${traceIdx.toString(16).padStart(2, "0")}${"d".repeat(14)}`,
          startTime,
          costTotalMicrocents: cost,
          tokensInput: 0,
          tokensOutput: 0,
        })
        return { ...row, tags: [...tags] }
      }

      const cheapRows = Array.from({ length: 5 }, (_v, i) => makeRowWithTags(i, 100, ["cheap"]))
      const expensiveRows = Array.from({ length: 5 }, (_v, i) => makeRowWithTags(i + 5, 10_000, ["expensive"]))
      const reversedOrderRows = Array.from({ length: 3 }, (_v, i) => makeRowWithTags(i + 10, 500, ["beta", "alpha"]))

      await Effect.runPromise(
        insertJsonEachRow(ch.client, "spans", [...cheapRows, ...expensiveRows, ...reversedOrderRows]),
      )

      const cheapBaseline = await runCh(
        repo.getCohortBaselineByTags({ organizationId: ORG_ID, projectId: PROJECT_ID, tags: ["cheap"] }),
      )
      const expensiveBaseline = await runCh(
        repo.getCohortBaselineByTags({ organizationId: ORG_ID, projectId: PROJECT_ID, tags: ["expensive"] }),
      )

      expect(cheapBaseline.metrics.costTotalMicrocents.p50).toBe(100)
      expect(expensiveBaseline.metrics.costTotalMicrocents.p50).toBe(10_000)
      expect(cheapBaseline.traceCount).toBe(5)
      expect(expensiveBaseline.traceCount).toBe(5)

      // Order-independent match: query ["alpha","beta"] finds rows stored with ["beta","alpha"]
      const alphaBetaBaseline = await runCh(
        repo.getCohortBaselineByTags({ organizationId: ORG_ID, projectId: PROJECT_ID, tags: ["alpha", "beta"] }),
      )
      expect(alphaBetaBaseline.traceCount).toBe(3)
      expect(alphaBetaBaseline.metrics.costTotalMicrocents.p50).toBe(500)

      // A subset of tags must NOT match a strict superset cohort.
      const alphaOnlyBaseline = await runCh(
        repo.getCohortBaselineByTags({ organizationId: ORG_ID, projectId: PROJECT_ID, tags: ["alpha"] }),
      )
      expect(alphaOnlyBaseline.traceCount).toBe(0)
    })

    it("treats the empty-tags cohort as a distinct bucket of untagged traces", async () => {
      const untaggedRows = Array.from({ length: 3 }, (_v, i): SpanRow => {
        const row = makeSpanRow({
          traceId: `${(20 + i).toString(16).padStart(2, "0")}${"e".repeat(30)}`,
          spanId: `${(20 + i).toString(16).padStart(2, "0")}${"f".repeat(14)}`,
          startTime: new Date(Date.UTC(2026, 0, 3, 0, 0, i)),
          costTotalMicrocents: 777,
          tokensInput: 0,
          tokensOutput: 0,
        })
        return { ...row, tags: [] }
      })

      await Effect.runPromise(insertJsonEachRow(ch.client, "spans", untaggedRows))

      const emptyCohort = await runCh(
        repo.getCohortBaselineByTags({ organizationId: ORG_ID, projectId: PROJECT_ID, tags: [] }),
      )

      expect(emptyCohort.traceCount).toBe(3)
      expect(emptyCohort.metrics.costTotalMicrocents.p50).toBe(777)

      // Tagged-cohort queries must not pick up untagged rows.
      const taggedCohort = await runCh(
        repo.getCohortBaselineByTags({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          tags: [BASELINE_TEST_TAG],
        }),
      )
      expect(taggedCohort.metrics.costTotalMicrocents.p50).not.toBe(777)
    })

    it("gates p95 (<100 samples) and p99 (<1000 samples) to null", async () => {
      const rows = Array.from({ length: 10 }, (_v, i) =>
        makeSpanRow({
          traceId: `${(30 + i).toString(16).padStart(2, "0")}${"a".repeat(30)}`,
          spanId: `${(30 + i).toString(16).padStart(2, "0")}${"b".repeat(14)}`,
          startTime: new Date(Date.UTC(2026, 0, 4, 0, 0, i)),
          costTotalMicrocents: (i + 1) * 10,
          tokensInput: 0,
          tokensOutput: 0,
        }),
      )
      await Effect.runPromise(insertJsonEachRow(ch.client, "spans", rows))

      const baseline = await runCh(
        repo.getCohortBaselineByTags({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          tags: [BASELINE_TEST_TAG],
        }),
      )

      expect(baseline.metrics.costTotalMicrocents.p95).toBeNull()
      expect(baseline.metrics.costTotalMicrocents.p99).toBeNull()
    })

    it("honors excludeTraceId", async () => {
      const keptRows = Array.from({ length: 3 }, (_v, i) =>
        makeSpanRow({
          traceId: `${(40 + i).toString(16).padStart(2, "0")}${"a".repeat(30)}`,
          spanId: `${(40 + i).toString(16).padStart(2, "0")}${"b".repeat(14)}`,
          startTime: new Date(Date.UTC(2026, 0, 5, 0, 0, i)),
          costTotalMicrocents: 100,
          tokensInput: 0,
          tokensOutput: 0,
        }),
      )
      const excludedRow = makeSpanRow({
        traceId: `44${"a".repeat(30)}`,
        spanId: `44${"b".repeat(14)}`,
        startTime: new Date(Date.UTC(2026, 0, 5, 0, 0, 3)),
        costTotalMicrocents: 999_999,
        tokensInput: 0,
        tokensOutput: 0,
      })

      await Effect.runPromise(insertJsonEachRow(ch.client, "spans", [...keptRows, excludedRow]))

      const baseline = await runCh(
        repo.getCohortBaselineByTags({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          tags: [BASELINE_TEST_TAG],
          excludeTraceId: excludedRow.trace_id as TraceId,
        }),
      )

      expect(baseline.traceCount).toBe(3)
      expect(baseline.metrics.costTotalMicrocents.p50).toBe(100)
    })
  })

  describe("findByTraceId", () => {
    it("prepends system instructions as first message in allMessages", async () => {
      const detail = await runCh(
        repo.findByTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TraceId(SEED_ANNOTATION_DEMO_TRACE_ID),
        }),
      )

      expect(detail.systemInstructions.length).toBeGreaterThan(0)
      expect(detail.allMessages.length).toBeGreaterThan(0)
      expect(detail.allMessages[0]?.role).toBe("system")
      expect(detail.allMessages[0]?.parts).toEqual(detail.systemInstructions)
    })

    it("allMessages starts with system message when systemInstructions present", async () => {
      const detail = await runCh(
        repo.findByTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
        }),
      )

      // If systemInstructions exist, first message should be system
      if (detail.systemInstructions.length > 0) {
        expect(detail.allMessages[0]?.role).toBe("system")
        expect(detail.allMessages[0]?.parts).toEqual(detail.systemInstructions)
      } else {
        // If no system instructions, first message should not be system (or allMessages is empty)
        if (detail.allMessages.length > 0) {
          expect(detail.allMessages[0]?.role).not.toBe("system")
        }
      }
    })
  })

  describe("listMatchingFilterIdsByTraceId", () => {
    it("returns the filter ids that match one trace", async () => {
      const filterIds = await runCh(
        repo.listMatchingFilterIdsByTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: TRACE_ID,
          filterSets: [
            { filterId: "all", filters: {} },
            {
              filterId: "lifecycle-tag",
              filters: {
                tags: [{ op: "in", value: ["lifecycle"] }],
              },
            },
            {
              filterId: "annotation-tag",
              filters: {
                tags: [{ op: "in", value: ["annotation"] }],
              },
            },
          ],
        }),
      )

      expect(filterIds).toEqual(["all", "lifecycle-tag"])
    })

    it("supports independent score-backed filters in the same batch", async () => {
      const filterIds = await runCh(
        repo.listMatchingFilterIdsByTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: SCORED_TRACE_ID,
          filterSets: [
            {
              filterId: "errored-evaluation-score",
              filters: {
                "score.errored": [{ op: "eq", value: true }],
                "score.source": [{ op: "eq", value: "evaluation" }],
              },
            },
            {
              filterId: "annotation-score",
              filters: {
                "score.source": [{ op: "eq", value: "annotation" }],
              },
            },
            {
              filterId: "passed-evaluation-score",
              filters: {
                "score.passed": [{ op: "eq", value: true }],
                "score.source": [{ op: "eq", value: "evaluation" }],
              },
            },
          ],
        }),
      )

      expect(filterIds).toEqual(["errored-evaluation-score", "annotation-score"])
    })

    it("returns an empty list when the trace does not exist", async () => {
      const filterIds = await runCh(
        repo.listMatchingFilterIdsByTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: "ffffffffffffffffffffffffffffffff" as TraceId,
          filterSets: [
            {
              filterId: "all",
              filters: {},
            },
          ],
        }),
      )

      expect(filterIds).toEqual([])
    })
  })

  describe("listByProjectId with searchQuery (mode dispatch)", () => {
    // Fresh test traces, IDs distinct from the seeded ones above.
    //
    // Layout:
    //   - HYBRID_TRACE    : phrase match `handOffToHuman` AND aligned embedding.
    //   - LEX_ONLY_TRACE  : phrase match, no embedding.
    //   - SEM_ONLY_TRACE  : no phrase match, aligned embedding.
    //   - NOISE_TRACE     : no phrase match, anti-parallel embedding.
    //   - PHRASE_NOEMB_TRACE : matches a different phrase (`property search`),
    //     no embedding — used to exercise multi-token phrase filters.
    const HYBRID_TRACE = TraceId(`${"a".repeat(31)}0`)
    const LEX_ONLY_TRACE = TraceId(`${"b".repeat(31)}0`)
    const SEM_ONLY_TRACE = TraceId(`${"c".repeat(31)}0`)
    const NOISE_TRACE = TraceId(`${"d".repeat(31)}0`)
    const PHRASE_NOEMB_TRACE = TraceId(`${"e".repeat(31)}0`)
    const DIMS = 2048

    // Mock AI returns [0.1, 0.1, ...]; cosineSimilarity against:
    //   aligned  [0.1, 0.1, ...]   → 1.0
    //   antiparallel [-0.1, -0.1, ...] → -1.0
    const alignedEmbedding = new Array(DIMS).fill(0.1) as readonly number[]
    const antiparallelEmbedding = new Array(DIMS).fill(-0.1) as readonly number[]

    const insertSearchRows = async () => {
      const startTime = new Date(Date.UTC(2026, 0, 1, 0, 0, 0))
      const traces = [HYBRID_TRACE, LEX_ONLY_TRACE, SEM_ONLY_TRACE, NOISE_TRACE, PHRASE_NOEMB_TRACE]
      const spans = traces.map((traceId, i) =>
        makeSpanRow({
          traceId,
          spanId: `${i.toString(16).padStart(2, "0")}${"e".repeat(14)}`,
          startTime: new Date(startTime.getTime() + i * 1000),
          costTotalMicrocents: 0,
          tokensInput: 0,
          tokensOutput: 0,
        }),
      )
      await Effect.runPromise(insertJsonEachRow(ch.client, "spans", spans))

      // Whitespace shape mirrors LAT-562: indexed bytes are compact JSON, so a
      // user typing `"handOffToHuman": true` (with a space) must still match.
      // The text-index tokenizer drops `:` and whitespace identically.
      const docs = [
        { traceId: HYBRID_TRACE, text: `{"handOffToHuman":true,"replyBody":"customer needle in checkout"}` },
        { traceId: LEX_ONLY_TRACE, text: `{"handOffToHuman":true,"replyBody":"audit review"}` },
        { traceId: SEM_ONLY_TRACE, text: `{"handOffToHuman":false,"replyBody":"customer needle clarification"}` },
        { traceId: NOISE_TRACE, text: `{"handOffToHuman":false,"replyBody":"unrelated noise"}` },
        { traceId: PHRASE_NOEMB_TRACE, text: `pricing complaint about property search billing` },
      ]
      await Effect.runPromise(
        insertJsonEachRow(
          ch.client,
          "trace_search_documents",
          docs.map((d, i) => ({
            organization_id: ORG_ID,
            project_id: PROJECT_ID,
            trace_id: d.traceId,
            start_time: toClickHouseDateTime(new Date(startTime.getTime() + i * 1000)),
            root_span_name: "root",
            search_text: d.text,
            content_hash: `${"f".repeat(63)}${i}`,
            indexed_at: toClickHouseDateTime(startTime),
          })),
        ),
      )

      await Effect.runPromise(
        insertJsonEachRow(ch.client, "trace_search_embeddings", [
          {
            organization_id: ORG_ID,
            project_id: PROJECT_ID,
            trace_id: HYBRID_TRACE,
            chunk_index: 0,
            start_time: toClickHouseDateTime(startTime),
            content_hash: `${"f".repeat(63)}0`,
            embedding_model: "voyage-4-large",
            embedding: [...alignedEmbedding],
            indexed_at: toClickHouseDateTime(startTime),
          },
          {
            organization_id: ORG_ID,
            project_id: PROJECT_ID,
            trace_id: SEM_ONLY_TRACE,
            chunk_index: 0,
            start_time: toClickHouseDateTime(startTime),
            content_hash: `${"f".repeat(63)}2`,
            embedding_model: "voyage-4-large",
            embedding: [...alignedEmbedding],
            indexed_at: toClickHouseDateTime(startTime),
          },
          {
            organization_id: ORG_ID,
            project_id: PROJECT_ID,
            trace_id: NOISE_TRACE,
            chunk_index: 0,
            start_time: toClickHouseDateTime(startTime),
            content_hash: `${"f".repeat(63)}3`,
            embedding_model: "voyage-4-large",
            embedding: [...antiparallelEmbedding],
            indexed_at: toClickHouseDateTime(startTime),
          },
        ]),
      )
    }

    // ─── Shape 1: ≥1 phrases, empty semantic — pure lexical filter ────────
    it("phrase-only: AND-filters by hasAllTokens, ignores embeddings, no relevance ordering", async () => {
      await insertSearchRows()

      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { searchQuery: '"handOffToHuman" "true"' },
        }),
      )

      const ids = page.items.map((t) => t.traceId)
      // Both phrases must be present. NOISE_TRACE has `handOffToHuman:false`,
      // so although both `handofftohuman` and `false` tokens are present,
      // `true` is not — it's filtered out. SEM_ONLY_TRACE same reasoning.
      expect(ids).toContain(HYBRID_TRACE)
      expect(ids).toContain(LEX_ONLY_TRACE)
      expect(ids).not.toContain(SEM_ONLY_TRACE)
      expect(ids).not.toContain(NOISE_TRACE)
      expect(ids).not.toContain(PHRASE_NOEMB_TRACE)
    })

    it("phrase-only with whitespace asymmetry: copy-pasted prettified JSON still matches compact-indexed text", async () => {
      await insertSearchRows()

      // The user copies a prettified field name with surrounding whitespace
      // and a colon — the same shape `prettifyCompactJson` shows. Tokenizer
      // drops both space and `:`, so it still matches the compact indexed bytes.
      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { searchQuery: '"handOffToHuman: true"' },
        }),
      )

      const ids = page.items.map((t) => t.traceId)
      expect(ids).toContain(HYBRID_TRACE)
      expect(ids).toContain(LEX_ONLY_TRACE)
      expect(ids).not.toContain(SEM_ONLY_TRACE)
      expect(ids).not.toContain(NOISE_TRACE)
    })

    // ─── Shape 2: empty phrases, ≥1 semantic — pure semantic ranking ──────
    it("semantic-only: ranks by cosine similarity and applies the relevance floor", async () => {
      await insertSearchRows()

      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { searchQuery: "needle" },
        }),
      )

      const ids = page.items.map((t) => t.traceId)
      // Aligned embeddings clear the floor; anti-parallel does not. Traces
      // with no embedding (LEX_ONLY, PHRASE_NOEMB) don't surface — semantic
      // only.
      expect(ids).toContain(HYBRID_TRACE)
      expect(ids).toContain(SEM_ONLY_TRACE)
      expect(ids).not.toContain(NOISE_TRACE)
      expect(ids).not.toContain(LEX_ONLY_TRACE)
      expect(ids).not.toContain(PHRASE_NOEMB_TRACE)
    })

    // ─── Shape 3: ≥1 phrases, ≥1 semantic — phrase filter + semantic rank ─
    it("hybrid: phrase filter narrows the set, semantic ranks within; phrase-only matches stay in", async () => {
      await insertSearchRows()

      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { searchQuery: '"handOffToHuman" "true" customer needle' },
        }),
      )

      const ids = page.items.map((t) => t.traceId)
      // Phrase gates: only HYBRID and LEX_ONLY pass (both have handOffToHuman
      // AND `:true`). Within those, HYBRID's aligned embedding ranks it above
      // LEX_ONLY, which has no embedding (relevance_score = 0). No semantic
      // floor in hybrid mode — phrase matches without an embedding stay in.
      expect(ids).toContain(HYBRID_TRACE)
      expect(ids).toContain(LEX_ONLY_TRACE)
      expect(ids).not.toContain(SEM_ONLY_TRACE)
      expect(ids).not.toContain(NOISE_TRACE)
      expect(ids.indexOf(HYBRID_TRACE)).toBeLessThan(ids.indexOf(LEX_ONLY_TRACE))
    })

    // ─── Multi-chunk rollup ──────────────────────────────────────────────
    it("rolls multiple chunks up to per-trace score via max(): one strong chunk wins over many weak ones", async () => {
      const startTime = new Date(Date.UTC(2026, 0, 2, 0, 0, 0))
      const ROLLUP_TRACE = TraceId(`${"5".repeat(31)}0`) // many weak chunks + one strong
      const FLAT_TRACE = TraceId(`${"6".repeat(31)}0`) // many uniform chunks at the floor

      const span0 = makeSpanRow({
        traceId: ROLLUP_TRACE,
        spanId: `00${"e".repeat(14)}`,
        startTime,
        costTotalMicrocents: 0,
        tokensInput: 0,
        tokensOutput: 0,
      })
      const span1 = makeSpanRow({
        traceId: FLAT_TRACE,
        spanId: `01${"e".repeat(14)}`,
        startTime: new Date(startTime.getTime() + 1_000),
        costTotalMicrocents: 0,
        tokensInput: 0,
        tokensOutput: 0,
      })
      await Effect.runPromise(insertJsonEachRow(ch.client, "spans", [span0, span1]))

      // ROLLUP_TRACE: 4 anti-parallel weak chunks + 1 aligned strong chunk.
      // Without rollup the trace would be dragged down by averaging; with
      // max() the strong chunk lifts it above the floor.
      const aligned = new Array(2048).fill(0.1) as readonly number[]
      const antiparallel = new Array(2048).fill(-0.1) as readonly number[]
      const slightlyAligned = new Array(2048).fill(0.05) as readonly number[]

      const rollupChunks = [
        ...Array.from({ length: 4 }, (_v, i) => ({
          chunk_index: i,
          embedding: [...antiparallel],
        })),
        { chunk_index: 4, embedding: [...aligned] },
      ]
      const flatChunks = Array.from({ length: 5 }, (_v, i) => ({
        chunk_index: i,
        embedding: [...slightlyAligned],
      }))

      await Effect.runPromise(
        insertJsonEachRow(
          ch.client,
          "trace_search_documents",
          [
            { trace_id: ROLLUP_TRACE, hashSuffix: "5" },
            { trace_id: FLAT_TRACE, hashSuffix: "6" },
          ].map((d, i) => ({
            organization_id: ORG_ID,
            project_id: PROJECT_ID,
            trace_id: d.trace_id,
            start_time: toClickHouseDateTime(new Date(startTime.getTime() + i * 1000)),
            root_span_name: "root",
            search_text: `placeholder text for ${d.trace_id}`,
            content_hash: `${"f".repeat(63)}${d.hashSuffix}`,
            indexed_at: toClickHouseDateTime(startTime),
          })),
        ),
      )

      const buildEmbeddingRow = (
        traceId: TraceId,
        chunkIndex: number,
        embedding: number[],
      ): Record<string, unknown> => ({
        organization_id: ORG_ID,
        project_id: PROJECT_ID,
        trace_id: traceId,
        chunk_index: chunkIndex,
        start_time: toClickHouseDateTime(startTime),
        content_hash: `${"a".repeat(60)}${traceId.slice(0, 2)}${chunkIndex.toString().padStart(2, "0")}`,
        embedding_model: "voyage-4-large",
        embedding,
        indexed_at: toClickHouseDateTime(startTime),
      })

      await Effect.runPromise(
        insertJsonEachRow(ch.client, "trace_search_embeddings", [
          ...rollupChunks.map((c) => buildEmbeddingRow(ROLLUP_TRACE, c.chunk_index, c.embedding)),
          ...flatChunks.map((c) => buildEmbeddingRow(FLAT_TRACE, c.chunk_index, c.embedding)),
        ]),
      )

      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { searchQuery: "needle" },
        }),
      )

      const ids = page.items.map((t) => t.traceId)
      // ROLLUP_TRACE surfaces because its best chunk is fully aligned (score 1.0),
      // even though four sibling chunks are anti-parallel.
      expect(ids).toContain(ROLLUP_TRACE)
      // FLAT_TRACE's chunks are all `slightlyAligned`; cosine similarity between
      // [0.05,...] and the mock query [0.1,...] is 1.0 (they're parallel, just
      // different magnitudes), so it surfaces too. Both rolled up to one row
      // each — no duplication from multi-chunk fan-out.
      expect(ids.filter((id) => id === ROLLUP_TRACE)).toHaveLength(1)
      expect(ids.filter((id) => id === FLAT_TRACE)).toHaveLength(1)
    })

    it("paginates ranked search on per-trace relevance, not per-chunk rows", async () => {
      const startTime = new Date(Date.UTC(2026, 0, 3, 0, 0, 0))
      const tag = "search-pagination-chunks"
      const traces = [TraceId(`${"7".repeat(31)}0`), TraceId(`${"8".repeat(31)}0`), TraceId(`${"9".repeat(31)}0`)]

      await Effect.runPromise(
        insertJsonEachRow(
          ch.client,
          "spans",
          traces.map((traceId, i) => ({
            ...makeSpanRow({
              traceId,
              spanId: `${(i + 20).toString(16).padStart(2, "0")}${"e".repeat(14)}`,
              startTime: new Date(startTime.getTime() + i * 1000),
              costTotalMicrocents: 0,
              tokensInput: 0,
              tokensOutput: 0,
            }),
            tags: [tag],
          })),
        ),
      )

      await Effect.runPromise(
        insertJsonEachRow(
          ch.client,
          "trace_search_documents",
          traces.map((traceId, i) => ({
            organization_id: ORG_ID,
            project_id: PROJECT_ID,
            trace_id: traceId,
            start_time: toClickHouseDateTime(new Date(startTime.getTime() + i * 1000)),
            root_span_name: "root",
            search_text: `pagination needle ${traceId}`,
            content_hash: `${"b".repeat(63)}${i}`,
            indexed_at: toClickHouseDateTime(startTime),
          })),
        ),
      )

      await Effect.runPromise(
        insertJsonEachRow(
          ch.client,
          "trace_search_embeddings",
          traces.flatMap((traceId, traceIndex) =>
            [0, 1].map((chunkIndex) => ({
              organization_id: ORG_ID,
              project_id: PROJECT_ID,
              trace_id: traceId,
              chunk_index: chunkIndex,
              start_time: toClickHouseDateTime(new Date(startTime.getTime() + traceIndex * 1000)),
              content_hash: `${"c".repeat(60)}${traceIndex.toString().padStart(2, "0")}${chunkIndex
                .toString()
                .padStart(2, "0")}`,
              embedding_model: "voyage-4-large",
              embedding: [...alignedEmbedding],
              indexed_at: toClickHouseDateTime(startTime),
            })),
          ),
        ),
      )

      const options = {
        limit: 1,
        searchQuery: "needle",
        filters: { tags: [{ op: "in", value: [tag] }] },
      } as const

      const first = await runCh(repo.listByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, options }))
      expect(first.nextCursor).toBeDefined()
      const firstCursor = first.nextCursor
      if (!firstCursor) throw new Error("Expected first search page to have a cursor")

      const second = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { ...options, cursor: firstCursor },
        }),
      )
      expect(second.nextCursor).toBeDefined()
      const secondCursor = second.nextCursor
      if (!secondCursor) throw new Error("Expected second search page to have a cursor")

      const third = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { ...options, cursor: secondCursor },
        }),
      )

      expect(first.hasMore).toBe(true)
      expect(second.hasMore).toBe(true)
      expect(third.hasMore).toBe(false)
      expect([...first.items, ...second.items, ...third.items].map((t) => t.traceId)).toEqual([...traces].reverse())
    })

    it("multi-token phrase: every token in the phrase must be present", async () => {
      await insertSearchRows()

      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { searchQuery: '"property search"' },
        }),
      )

      const ids = page.items.map((t) => t.traceId)
      expect(ids).toEqual([PHRASE_NOEMB_TRACE])
    })

    it("keeps count / metrics / histogram consistent with the list", async () => {
      await insertSearchRows()

      const SEARCH = '"handOffToHuman" "true"'

      const [page, count, metrics, histogram] = await Promise.all([
        runCh(
          repo.listByProjectId({
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            options: { searchQuery: SEARCH },
          }),
        ),
        runCh(repo.countByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, searchQuery: SEARCH })),
        runCh(
          repo.aggregateMetricsByProjectId({
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            searchQuery: SEARCH,
          }),
        ),
        runCh(
          repo.histogramByProjectId({
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            bucketSeconds: 3600,
            searchQuery: SEARCH,
          }),
        ),
      ])

      const histogramCount = histogram.reduce((sum, bucket) => sum + bucket.traceCount, 0)
      const histogramSpanSum = histogram.reduce((sum, bucket) => sum + bucket.spanCountSum, 0)
      const histogramTokenSum = histogram.reduce((sum, bucket) => sum + bucket.tokensTotalSum, 0)
      const histogramCostSum = histogram.reduce((sum, bucket) => sum + bucket.costTotalMicrocentsSum, 0)
      expect(page.items).toHaveLength(2)
      expect(count).toBe(2)
      expect(metrics.spanCount.sum).toBe(2)
      expect(histogramCount).toBe(2)
      expect(histogramSpanSum).toBe(metrics.spanCount.sum)
      expect(histogramTokenSum).toBe(metrics.tokensTotal.sum)
      expect(histogramCostSum).toBe(metrics.costTotalMicrocents.sum)
    })
  })
})
