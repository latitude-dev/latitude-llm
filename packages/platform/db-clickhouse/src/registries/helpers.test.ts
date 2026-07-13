import type { FilterCondition } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { buildClickHouseWhere } from "../filter-builder.ts"
import { buildCacheHitRateClause, mapDateTime64UtcQueryParam } from "./helpers.ts"

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

describe("mapDateTime64UtcQueryParam", () => {
  it("strips a trailing Z from a toISOString()-style value", () => {
    expect(mapDateTime64UtcQueryParam("2026-06-09T22:41:43.054269Z")).toBe("2026-06-09 22:41:43.054269")
  })

  it("strips a +00:00 UTC offset, as produced by Postgres timestamps", () => {
    expect(mapDateTime64UtcQueryParam("2026-06-09 22:41:43.054269+00:00")).toBe("2026-06-09 22:41:43.054269")
  })

  it("strips a non-UTC offset with a colon", () => {
    expect(mapDateTime64UtcQueryParam("2026-06-09T22:41:43.054269-05:00")).toBe("2026-06-09 22:41:43.054269")
  })

  it("strips an offset without a colon", () => {
    expect(mapDateTime64UtcQueryParam("2026-06-09T22:41:43.054269+0000")).toBe("2026-06-09 22:41:43.054269")
  })

  it("leaves a value with no timezone suffix untouched apart from the T separator", () => {
    expect(mapDateTime64UtcQueryParam("2026-06-09T22:41:43.054269")).toBe("2026-06-09 22:41:43.054269")
  })

  it("passes non-string values through unchanged", () => {
    expect(mapDateTime64UtcQueryParam(42)).toBe(42)
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
