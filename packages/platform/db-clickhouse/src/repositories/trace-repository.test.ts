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
import { TraceRepository, type TraceRepositoryShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import { scoreSeeders } from "../seeds/scores/index.ts"
import { fixedTraceSeeders } from "../seeds/spans/fixed-traces.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { insertJsonEachRow } from "../sql.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { TraceRepositoryLive } from "./trace-repository.ts"

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
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* TraceRepository
      }).pipe(withClickHouse(TraceRepositoryLive, ch.client, ORG_ID)),
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
})
