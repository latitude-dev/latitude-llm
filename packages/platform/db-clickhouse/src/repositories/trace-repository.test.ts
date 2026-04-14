import {
  OrganizationId,
  ProjectId,
  SEED_LIFECYCLE_TRACE_IDS,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  type TraceId,
} from "@domain/shared/seeding"
import { TraceRepository, type TraceRepositoryShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { fixedTraceSeeders } from "../seeds/spans/fixed-traces.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { insertJsonEachRow } from "../sql.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { TraceRepositoryLive } from "./trace-repository.ts"

const ORG_ID = OrganizationId(SEED_ORG_ID)
const PROJECT_ID = ProjectId(SEED_PROJECT_ID)
const TRACE_ID = SEED_LIFECYCLE_TRACE_IDS[0] as TraceId
const firstFixedTraceSeeder = fixedTraceSeeders[0]
const BASELINE_TEST_TAG = "baseline-missing-values"

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

const ch = setupTestClickHouse()

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
  })

  describe("matchesFiltersByTraceId", () => {
    it("returns true when the trace matches the canonical filter semantics", async () => {
      const matches = await Effect.runPromise(
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
      const matches = await Effect.runPromise(
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
      const matches = await Effect.runPromise(
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

  describe("getCohortBaselineByProjectId", () => {
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

      const baseline = await Effect.runPromise(
        repo.getCohortBaselineByProjectId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          filters: {
            tags: [{ op: "in", value: [BASELINE_TEST_TAG] }],
          },
        }),
      )

      expect(baseline.metrics.costTotalMicrocents.sampleCount).toBe(1)
      expect(baseline.metrics.costTotalMicrocents.p50).toBe(500)
      expect(baseline.metrics.costTotalMicrocents.p90).toBe(500)
      expect(baseline.metrics.tokensTotal.sampleCount).toBe(1)
      expect(baseline.metrics.tokensTotal.p50).toBe(100)
      expect(baseline.metrics.tokensTotal.p90).toBe(100)
    })
  })
})
