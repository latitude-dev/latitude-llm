import type { FilterCondition } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { buildClickHouseWhere } from "../filter-builder.ts"
import { buildCacheHitRateClause } from "./helpers.ts"

describe("buildCacheHitRateClause", () => {
  it("builds a divide-by-zero-guarded HAVING ratio for gte, treating the value as a percentage", () => {
    const cond: FilterCondition = { op: "gte", value: 80 }
    const { clause, params } = buildCacheHitRateClause(cond, "f_0")
    expect(clause).toBe(
      "((tokens_input + tokens_cache_read + tokens_cache_create) > 0 AND " +
        "(tokens_cache_read / (tokens_input + tokens_cache_read + tokens_cache_create)) >= {f_0:Float64} / 100)",
    )
    expect(params).toEqual({ f_0: 80 })
  })

  it("supports lte for finding broken-cache (low-rate) rows", () => {
    const { clause, params } = buildCacheHitRateClause({ op: "lte", value: 50 }, "f_1")
    expect(clause).toContain(") <= {f_1:Float64} / 100)")
    expect(params).toEqual({ f_1: 50 })
  })

  it("rejects non-comparison operators", () => {
    expect(() => buildCacheHitRateClause({ op: "contains", value: "x" }, "f_0")).toThrow(
      /Unsupported cacheHitRate filter operator/,
    )
  })
})

describe("cacheHitRate via buildClickHouseWhere", () => {
  const registry = {
    cacheHitRate: { kind: "synthetic", buildClause: buildCacheHitRateClause },
  } as const

  it("compiles a min/max range into two guarded clauses with Float64 params", () => {
    const { clauses, params } = buildClickHouseWhere(
      {
        cacheHitRate: [
          { op: "gte", value: 80 },
          { op: "lte", value: 95 },
        ],
      },
      registry,
    )
    expect(clauses).toHaveLength(2)
    expect(clauses[0]).toContain(">= {f_0:Float64} / 100")
    expect(clauses[1]).toContain("<= {f_1:Float64} / 100")
    expect(params).toEqual({ f_0: 80, f_1: 95 })
  })
})
