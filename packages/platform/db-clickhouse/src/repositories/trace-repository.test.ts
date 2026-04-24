import { AI, AIError, type AIShape } from "@domain/ai"
import type { ChSqlClient } from "@domain/shared"
import {
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

const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

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
    await Effect.runPromise(firstFixedTraceSeeder.run({ client: ch.client }))
    await Effect.runPromise(firstScoreSeeder.run({ client: ch.client }))
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

  describe("listByProjectId with searchQuery (hybrid path)", () => {
    // These test traces are inserted fresh in each test (no shared seeder),
    // so their IDs don't collide with the fixed/scored seeders above.
    const HYBRID_TRACE = TraceId(`${"a".repeat(31)}0`) // lexical + semantic match
    const LEX_ONLY_TRACE = TraceId(`${"b".repeat(31)}0`) // lexical match, no embedding
    const SEM_ONLY_TRACE = TraceId(`${"c".repeat(31)}0`) // no lexical, aligned embedding
    const NOISE_TRACE = TraceId(`${"d".repeat(31)}0`) // anti-parallel embedding → below floor
    const DIMS = 2048
    const QUERY = "needle"

    // Mock AI returns [0.1, 0.1, ...]; cosineSimilarity against:
    //   aligned  [0.1, 0.1, ...]   → 1.0
    //   antiparallel [-0.1, -0.1, ...] → -1.0
    const alignedEmbedding = new Array(DIMS).fill(0.1) as readonly number[]
    const antiparallelEmbedding = new Array(DIMS).fill(-0.1) as readonly number[]

    const insertSearchRows = async () => {
      const startTime = new Date(Date.UTC(2026, 0, 1, 0, 0, 0))
      const spans = [HYBRID_TRACE, LEX_ONLY_TRACE, SEM_ONLY_TRACE, NOISE_TRACE].map((traceId, i) =>
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

      const docs = [
        { traceId: HYBRID_TRACE, text: `customer ${QUERY} in checkout` },
        { traceId: LEX_ONLY_TRACE, text: `audit review mentions ${QUERY}` },
        { traceId: SEM_ONLY_TRACE, text: "unrelated routine diagnostic" },
        { traceId: NOISE_TRACE, text: "unrelated noise text" },
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
            start_time: toClickHouseDateTime(startTime),
            content_hash: `${"f".repeat(63)}3`,
            embedding_model: "voyage-4-large",
            embedding: [...antiparallelEmbedding],
            indexed_at: toClickHouseDateTime(startTime),
          },
        ]),
      )
    }

    it("ranks lexical+semantic, lexical-only, and semantic-only hits above the floor and drops antiparallel noise", async () => {
      await insertSearchRows()

      const page = await runCh(
        repo.listByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          options: { searchQuery: QUERY },
        }),
      )

      const ids = page.items.map((t) => t.traceId)

      // HYBRID_TRACE (score 1.0) and SEM_ONLY_TRACE (0.7) are semantic-ranked
      // above LEX_ONLY_TRACE (0.3). NOISE_TRACE (-0.7) is cut by the HAVING
      // floor. This is also the UNION-ALL/FULL-OUTER-JOIN regression test:
      // SEM_ONLY_TRACE has no lexical row, and with FULL OUTER JOIN its
      // FixedString(32) trace_id would coalesce to zero bytes and drop out
      // of the downstream inner join against `traces`. UNION ALL preserves it.
      expect(ids).toContain(HYBRID_TRACE)
      expect(ids).toContain(LEX_ONLY_TRACE)
      expect(ids).toContain(SEM_ONLY_TRACE)
      expect(ids).not.toContain(NOISE_TRACE)

      // HYBRID > SEM_ONLY > LEX_ONLY by relevance, regardless of trace_id tie-break.
      expect(ids.indexOf(HYBRID_TRACE)).toBeLessThan(ids.indexOf(SEM_ONLY_TRACE))
      expect(ids.indexOf(SEM_ONLY_TRACE)).toBeLessThan(ids.indexOf(LEX_ONLY_TRACE))
    })

    it("keeps count / metrics / histogram consistent with the list", async () => {
      await insertSearchRows()

      const [page, count, metrics, histogram] = await Promise.all([
        runCh(
          repo.listByProjectId({
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            options: { searchQuery: QUERY },
          }),
        ),
        runCh(repo.countByProjectId({ organizationId: ORG_ID, projectId: PROJECT_ID, searchQuery: QUERY })),
        runCh(
          repo.aggregateMetricsByProjectId({
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            searchQuery: QUERY,
          }),
        ),
        runCh(
          repo.histogramByProjectId({
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            bucketSeconds: 3600,
            searchQuery: QUERY,
          }),
        ),
      ])

      // All four agree on the same 3-trace result set (hybrid, lexical-only,
      // semantic-only — the antiparallel noise row is below the floor).
      const histogramCount = histogram.reduce((sum, bucket) => sum + bucket.traceCount, 0)
      expect(page.items).toHaveLength(3)
      expect(count).toBe(3)
      expect(metrics.spanCount.sum).toBe(3)
      expect(histogramCount).toBe(3)
    })
  })
})
