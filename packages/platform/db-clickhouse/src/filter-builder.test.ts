import type { FilterCondition, FilterSet } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { buildClickHouseWhere, type ChFieldRegistry } from "./filter-builder.ts"

function mapStatus(v: FilterCondition["value"]): FilterCondition["value"] {
  const map: Record<string, number> = { error: 2, ok: 1, unset: 0 }
  if (Array.isArray(v)) return v.map((x) => map[String(x)] ?? 0)
  return map[String(v)] ?? 0
}

const registry: ChFieldRegistry = {
  status: { column: "overall_status", chType: "UInt8", mapValue: mapStatus },
  name: { column: "root_span_name", chType: "String" },
  cost: { column: "cost_total_microcents", chType: "UInt64" },
  tags: { column: "tags", chType: "String", isArray: true },
}

describe("buildClickHouseWhere", () => {
  it("returns empty for empty filters", () => {
    const result = buildClickHouseWhere({}, registry)
    expect(result.clauses).toEqual([])
    expect(result.params).toEqual({})
  })

  it("handles eq operator", () => {
    const filters: FilterSet = { name: [{ op: "eq", value: "hello" }] }
    const { clauses, params } = buildClickHouseWhere(filters, registry)
    expect(clauses).toHaveLength(1)
    expect(clauses[0]).toBe("root_span_name = {f_0:String}")
    expect(params.f_0).toBe("hello")
  })

  it("handles neq operator", () => {
    const filters: FilterSet = { name: [{ op: "neq", value: "hello" }] }
    const { clauses } = buildClickHouseWhere(filters, registry)
    expect(clauses[0]).toBe("root_span_name != {f_0:String}")
  })

  it("handles gt/gte/lt/lte operators", () => {
    const filters: FilterSet = {
      cost: [
        { op: "gte", value: 100 },
        { op: "lte", value: 500 },
      ],
    }
    const { clauses, params } = buildClickHouseWhere(filters, registry)
    expect(clauses).toHaveLength(2)
    expect(clauses[0]).toBe("cost_total_microcents >= {f_0:UInt64}")
    expect(clauses[1]).toBe("cost_total_microcents <= {f_1:UInt64}")
    expect(params.f_0).toBe(100)
    expect(params.f_1).toBe(500)
  })

  it("handles in operator on scalar field", () => {
    const filters: FilterSet = { status: [{ op: "in", value: ["error", "ok"] }] }
    const { clauses, params } = buildClickHouseWhere(filters, registry)
    expect(clauses[0]).toBe("overall_status IN ({f_0:Array(UInt8)})")
    // mapValue should have been applied
    expect(params.f_0).toEqual([2, 1])
  })

  it("handles notIn operator on scalar field", () => {
    const filters: FilterSet = { status: [{ op: "notIn", value: ["error"] }] }
    const { clauses } = buildClickHouseWhere(filters, registry)
    expect(clauses[0]).toBe("overall_status NOT IN ({f_0:Array(UInt8)})")
  })

  it("handles in operator on array field (hasAny)", () => {
    const filters: FilterSet = { tags: [{ op: "in", value: ["prod", "staging"] }] }
    const { clauses, params } = buildClickHouseWhere(filters, registry)
    expect(clauses[0]).toBe("hasAny(tags, {f_0:Array(String)})")
    expect(params.f_0).toEqual(["prod", "staging"])
  })

  it("handles notIn operator on array field (NOT hasAny)", () => {
    const filters: FilterSet = { tags: [{ op: "notIn", value: ["test"] }] }
    const { clauses } = buildClickHouseWhere(filters, registry)
    expect(clauses[0]).toBe("NOT hasAny(tags, {f_0:Array(String)})")
  })

  it("handles contains operator (auto-wraps with %)", () => {
    const filters: FilterSet = { name: [{ op: "contains", value: "chat" }] }
    const { clauses, params } = buildClickHouseWhere(filters, registry)
    expect(clauses[0]).toBe("root_span_name ILIKE {f_0:String}")
    expect(params.f_0).toBe("%chat%")
  })

  it("handles notContains operator (auto-wraps with %)", () => {
    const filters: FilterSet = { name: [{ op: "notContains", value: "test" }] }
    const { clauses, params } = buildClickHouseWhere(filters, registry)
    expect(clauses[0]).toBe("root_span_name NOT ILIKE {f_0:String}")
    expect(params.f_0).toBe("%test%")
  })

  it("applies mapValue transform", () => {
    const filters: FilterSet = { status: [{ op: "eq", value: "error" }] }
    const { params } = buildClickHouseWhere(filters, registry)
    expect(params.f_0).toBe(2)
  })

  it("skips unknown fields", () => {
    const filters: FilterSet = { unknownField: [{ op: "eq", value: "test" }] }
    const { clauses, params } = buildClickHouseWhere(filters, registry)
    expect(clauses).toHaveLength(0)
    expect(Object.keys(params)).toHaveLength(0)
  })

  it("handles metadata dot-notation", () => {
    const filters: FilterSet = { "metadata.env": [{ op: "eq", value: "prod" }] }
    const { clauses, params } = buildClickHouseWhere(filters, registry)
    expect(clauses).toHaveLength(1)
    // Should have both key param and value param
    expect(clauses[0]).toMatch(/ifNull\(metadata\[\{f_\d+:String\}\], ''\) = \{f_\d+:String\}/)
    // One param is the key, the other is the value
    const values = Object.values(params)
    expect(values).toContain("env")
    expect(values).toContain("prod")
  })

  it("handles metadata with contains operator", () => {
    const filters: FilterSet = { "metadata.version": [{ op: "contains", value: "v2" }] }
    const { clauses, params } = buildClickHouseWhere(filters, registry)
    expect(clauses[0]).toMatch(/ifNull\(metadata\[\{f_\d+:String\}\], ''\) ILIKE \{f_\d+:String\}/)
    const values = Object.values(params)
    expect(values).toContain("version")
    expect(values).toContain("%v2%")
  })

  it("handles metadata nested dot notation keys", () => {
    const filters: FilterSet = { "metadata.runtime.env.name": [{ op: "eq", value: "prod" }] }
    const { clauses, params } = buildClickHouseWhere(filters, registry)
    expect(clauses[0]).toMatch(/ifNull\(metadata\[\{f_\d+:String\}\], ''\) = \{f_\d+:String\}/)
    const values = Object.values(params)
    expect(values).toContain("runtime.env.name")
    expect(values).toContain("prod")
  })

  it("handles metadata in operator", () => {
    const filters: FilterSet = { "metadata.env": [{ op: "in", value: ["prod", "staging"] }] }
    const { clauses, params } = buildClickHouseWhere(filters, registry)
    expect(clauses[0]).toMatch(/ifNull\(metadata\[\{f_\d+:String\}\], ''\) IN \(\{f_\d+:Array\(String\)\}\)/)
    const values = Object.values(params)
    expect(values).toContain("env")
    expect(values).toContainEqual(["prod", "staging"])
  })

  it("handles metadata notIn operator", () => {
    const filters: FilterSet = { "metadata.env": [{ op: "notIn", value: ["prod"] }] }
    const { clauses, params } = buildClickHouseWhere(filters, registry)
    expect(clauses[0]).toMatch(/ifNull\(metadata\[\{f_\d+:String\}\], ''\) NOT IN \(\{f_\d+:Array\(String\)\}\)/)
    const values = Object.values(params)
    expect(values).toContain("env")
    expect(values).toContainEqual(["prod"])
  })

  it("handles multiple fields (AND'd together)", () => {
    const filters: FilterSet = {
      status: [{ op: "in", value: ["error"] }],
      cost: [{ op: "gte", value: 100 }],
      name: [{ op: "contains", value: "chat" }],
    }
    const { clauses } = buildClickHouseWhere(filters, registry)
    expect(clauses).toHaveLength(3)
  })

  it("handles multiple conditions on same field", () => {
    const filters: FilterSet = {
      cost: [
        { op: "gte", value: 100 },
        { op: "lte", value: 500 },
      ],
    }
    const { clauses } = buildClickHouseWhere(filters, registry)
    expect(clauses).toHaveLength(2)
  })

  it("skips fields with empty conditions array", () => {
    const filters: FilterSet = { status: [] }
    const { clauses } = buildClickHouseWhere(filters, registry)
    expect(clauses).toHaveLength(0)
  })

  it("emits in/notIn with an empty value list (matches no tag / no status)", () => {
    const filters: FilterSet = {
      status: [{ op: "in", value: [] }],
      tags: [{ op: "in", value: [] }],
    }
    const { clauses, params } = buildClickHouseWhere(filters, registry)
    expect(clauses).toHaveLength(2)
    expect(params.f_0).toEqual([])
    expect(params.f_1).toEqual([])
    expect(clauses[0]).toBe("overall_status IN ({f_0:Array(UInt8)})")
    expect(clauses[1]).toBe("hasAny(tags, {f_1:Array(String)})")
  })

  it("emits metadata in with an empty value list", () => {
    const filters: FilterSet = { "metadata.env": [{ op: "in", value: [] }] }
    const { clauses, params } = buildClickHouseWhere(filters, registry)
    expect(clauses).toHaveLength(1)
    expect(clauses[0]).toMatch(/ifNull\(metadata\[\{f_\d+:String\}\], ''\) IN \(\{f_\d+:Array\(String\)\}\)/)
    const values = Object.values(params)
    expect(values).toContain("env")
    expect(values).toContainEqual([])
  })
})

describe("buildClickHouseWhere with arrayContains", () => {
  const arrayContainsRegistry: ChFieldRegistry = {
    traceId: { column: "trace_ids", chType: "FixedString(32)", isArray: true, arrayContains: true },
    tags: { column: "tags", chType: "String", isArray: true, arrayContains: true },
  }

  it("routes scalar eq to has(col, …)", () => {
    const filters: FilterSet = { traceId: [{ op: "eq", value: "abc123" }] }
    const { clauses, params } = buildClickHouseWhere(filters, arrayContainsRegistry)
    expect(clauses[0]).toBe("has(trace_ids, {f_0:FixedString(32)})")
    expect(params.f_0).toBe("abc123")
  })

  it("routes scalar neq to NOT has(col, …)", () => {
    const filters: FilterSet = { traceId: [{ op: "neq", value: "abc123" }] }
    const { clauses } = buildClickHouseWhere(filters, arrayContainsRegistry)
    expect(clauses[0]).toBe("NOT has(trace_ids, {f_0:FixedString(32)})")
  })

  it("routes contains to has(col, …) and does NOT auto-wrap value in %", () => {
    const filters: FilterSet = { traceId: [{ op: "contains", value: "abc123" }] }
    const { clauses, params } = buildClickHouseWhere(filters, arrayContainsRegistry)
    expect(clauses[0]).toBe("has(trace_ids, {f_0:FixedString(32)})")
    expect(params.f_0).toBe("abc123")
  })

  it("routes notContains to NOT has(col, …) without % wrapping", () => {
    const filters: FilterSet = { tags: [{ op: "notContains", value: "internal" }] }
    const { clauses, params } = buildClickHouseWhere(filters, arrayContainsRegistry)
    expect(clauses[0]).toBe("NOT has(tags, {f_0:String})")
    expect(params.f_0).toBe("internal")
  })

  it("keeps in/notIn on hasAny — arrayContains only affects scalar ops", () => {
    const filters: FilterSet = {
      tags: [{ op: "in", value: ["prod", "staging"] }],
    }
    const { clauses, params } = buildClickHouseWhere(filters, arrayContainsRegistry)
    expect(clauses[0]).toBe("hasAny(tags, {f_0:Array(String)})")
    expect(params.f_0).toEqual(["prod", "staging"])
  })
})

describe("buildClickHouseWhere with synthetic fields", () => {
  const syntheticRegistry: ChFieldRegistry = {
    status: {
      kind: "synthetic",
      buildClause: (cond) => {
        const fragments: Record<string, string> = {
          ok: "(error_count = 0 AND span_count > 0)",
          error: "(error_count > 0)",
          unset: "(span_count = 0)",
        }
        const raw = Array.isArray(cond.value) ? cond.value : [cond.value]
        const parts = raw.map((v) => fragments[String(v)] ?? "1 = 0")
        const disjunction = parts.join(" OR ")
        switch (cond.op) {
          case "eq":
          case "in":
            return { clause: `(${disjunction})`, params: {} }
          case "neq":
          case "notIn":
            return { clause: `NOT (${disjunction})`, params: {} }
          default:
            throw new Error(`Unsupported status op: ${cond.op}`)
        }
      },
    },
    hasLlmActivity: {
      kind: "synthetic",
      buildClause: (cond) => {
        const fragment = "(tokens_total > 0 OR length(models) > 0)"
        const truthy = cond.value === true
        return {
          clause: truthy ? fragment : `NOT ${fragment}`,
          params: {},
        }
      },
    },
  }

  it("invokes the synthetic buildClause for eq", () => {
    const filters: FilterSet = { status: [{ op: "eq", value: "error" }] }
    const { clauses, params } = buildClickHouseWhere(filters, syntheticRegistry)
    expect(clauses[0]).toBe("((error_count > 0))")
    expect(params).toEqual({})
  })

  it("invokes the synthetic buildClause for in across multiple values", () => {
    const filters: FilterSet = { status: [{ op: "in", value: ["ok", "error"] }] }
    const { clauses } = buildClickHouseWhere(filters, syntheticRegistry)
    expect(clauses[0]).toBe("((error_count = 0 AND span_count > 0) OR (error_count > 0))")
  })

  it("invokes the synthetic buildClause for neq (negation)", () => {
    const filters: FilterSet = { status: [{ op: "neq", value: "error" }] }
    const { clauses } = buildClickHouseWhere(filters, syntheticRegistry)
    expect(clauses[0]).toBe("NOT ((error_count > 0))")
  })

  it("handles boolean-valued synthetic clauses", () => {
    const filters: FilterSet = { hasLlmActivity: [{ op: "eq", value: true }] }
    const { clauses } = buildClickHouseWhere(filters, syntheticRegistry)
    expect(clauses[0]).toBe("(tokens_total > 0 OR length(models) > 0)")
  })

  it("handles boolean-valued synthetic clauses (negated)", () => {
    const filters: FilterSet = { hasLlmActivity: [{ op: "eq", value: false }] }
    const { clauses } = buildClickHouseWhere(filters, syntheticRegistry)
    expect(clauses[0]).toBe("NOT (tokens_total > 0 OR length(models) > 0)")
  })

  it("merges params returned by the synthetic buildClause", () => {
    const paramRegistry: ChFieldRegistry = {
      paramSynthetic: {
        kind: "synthetic",
        buildClause: (_cond, paramPrefix) => ({
          clause: `(some_col > {${paramPrefix}_a:UInt64} AND other_col < {${paramPrefix}_b:UInt64})`,
          params: { [`${paramPrefix}_a`]: 10, [`${paramPrefix}_b`]: 100 },
        }),
      },
    }
    const filters: FilterSet = { paramSynthetic: [{ op: "eq", value: "ignored" }] }
    const { clauses, params } = buildClickHouseWhere(filters, paramRegistry)
    expect(clauses[0]).toBe("(some_col > {f_0_a:UInt64} AND other_col < {f_0_b:UInt64})")
    expect(params).toEqual({ f_0_a: 10, f_0_b: 100 })
  })

  it("emits multiple clauses when a synthetic field has multiple conditions", () => {
    const filters: FilterSet = {
      status: [
        { op: "in", value: ["error"] },
        { op: "notIn", value: ["unset"] },
      ],
    }
    const { clauses } = buildClickHouseWhere(filters, syntheticRegistry)
    expect(clauses).toHaveLength(2)
    expect(clauses[0]).toBe("((error_count > 0))")
    expect(clauses[1]).toBe("NOT ((span_count = 0))")
  })
})
