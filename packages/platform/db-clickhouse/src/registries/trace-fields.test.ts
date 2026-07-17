import { SCORE_FILTER_FIELDS, TRACE_TELEMETRY_FILTER_FIELDS } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { buildClickHouseWhere } from "../filter-builder.ts"
import { SCORE_FILTER_KEYS } from "./score-fields.ts"
import { SESSION_FIELD_REGISTRY } from "./session-fields.ts"
import { TRACE_FIELD_REGISTRY } from "./trace-fields.ts"

const sorted = (values: Iterable<string>): string[] => [...values].sort()

describe("trace filter registries stay in sync with the domain allow-list", () => {
  it("TRACE_FIELD_REGISTRY keys match TRACE_TELEMETRY_FILTER_FIELDS", () => {
    expect(sorted(Object.keys(TRACE_FIELD_REGISTRY))).toEqual(sorted(TRACE_TELEMETRY_FILTER_FIELDS))
  })

  it("SCORE_FILTER_KEYS match the domain SCORE_FILTER_FIELDS", () => {
    expect(sorted(SCORE_FILTER_KEYS)).toEqual(sorted(SCORE_FILTER_FIELDS))
  })

  it("registers endTime on both trace and session registries", () => {
    expect(TRACE_FIELD_REGISTRY).toHaveProperty("endTime")
    expect(SESSION_FIELD_REGISTRY).toHaveProperty("endTime")
  })
})

describe("endTime filter compiles to a HAVING clause (no longer silently skipped)", () => {
  it("builds a parameterized end_time comparison for gte/lte", () => {
    const { clauses, params } = buildClickHouseWhere(
      {
        endTime: [
          { op: "gte", value: "2026-01-01T00:00:00Z" },
          { op: "lte", value: "2026-01-02T00:00:00Z" },
        ],
      },
      TRACE_FIELD_REGISTRY,
    )

    expect(clauses).toEqual([
      "end_time >= parseDateTime64BestEffort({f_0:String}, 9, 'UTC')",
      "end_time <= parseDateTime64BestEffort({f_1:String}, 9, 'UTC')",
    ])
    expect(params.f_0).toBe("2026-01-01T00:00:00Z")
    expect(params.f_1).toBe("2026-01-02T00:00:00Z")
  })
})
