import { describe, expect, it } from "vitest"
import { buildMultiSelectArrayFilter, getMultiSelectArrayFilter } from "./multi-select-filter.ts"

describe("getMultiSelectArrayFilter", () => {
  it("returns in with empty values when field is absent", () => {
    expect(getMultiSelectArrayFilter({}, "tags")).toEqual({ op: "in", values: [] })
  })

  it("reads in operator", () => {
    const filters = { tags: [{ op: "in" as const, value: ["a", "b"] }] }
    expect(getMultiSelectArrayFilter(filters, "tags")).toEqual({ op: "in", values: ["a", "b"] })
  })

  it("reads notIn operator", () => {
    const filters = { tags: [{ op: "notIn" as const, value: ["x"] }] }
    expect(getMultiSelectArrayFilter(filters, "tags")).toEqual({ op: "notIn", values: ["x"] })
  })

  it("reads all (multiple eq) as contains all", () => {
    const filters = {
      tags: [
        { op: "eq" as const, value: "prod" },
        { op: "eq" as const, value: "staging" },
      ],
    }
    expect(getMultiSelectArrayFilter(filters, "tags")).toEqual({ op: "all", values: ["prod", "staging"] })
  })

  it("normalizes legacy neq list to notIn", () => {
    const filters = {
      tags: [
        { op: "neq" as const, value: "internal" },
        { op: "neq" as const, value: "debug" },
      ],
    }
    expect(getMultiSelectArrayFilter(filters, "tags")).toEqual({ op: "notIn", values: ["internal", "debug"] })
  })
})

describe("buildMultiSelectArrayFilter", () => {
  it("returns empty for no values", () => {
    expect(buildMultiSelectArrayFilter("in", [])).toEqual([])
  })

  it("builds in condition", () => {
    expect(buildMultiSelectArrayFilter("in", ["a"])).toEqual([{ op: "in", value: ["a"] }])
  })

  it("builds notIn condition", () => {
    expect(buildMultiSelectArrayFilter("notIn", ["m1"])).toEqual([{ op: "notIn", value: ["m1"] }])
  })

  it("builds all as multiple eq", () => {
    expect(buildMultiSelectArrayFilter("all", ["t1", "t2"])).toEqual([
      { op: "eq", value: "t1" },
      { op: "eq", value: "t2" },
    ])
  })
})

describe("operator round-trip", () => {
  it("preserves values when switching operator via rebuild", () => {
    const values = ["flagger:classify", "prod"] as const
    const fromIn = { tags: buildMultiSelectArrayFilter("in", values) }
    const parsed = getMultiSelectArrayFilter(fromIn, "tags")
    expect(parsed).toEqual({ op: "in", values: ["flagger:classify", "prod"] })

    const switched = { tags: buildMultiSelectArrayFilter("notIn", parsed.values) }
    expect(getMultiSelectArrayFilter(switched, "tags")).toEqual({
      op: "notIn",
      values: ["flagger:classify", "prod"],
    })

    const all = { tags: buildMultiSelectArrayFilter("all", parsed.values) }
    expect(getMultiSelectArrayFilter(all, "tags")).toEqual({
      op: "all",
      values: ["flagger:classify", "prod"],
    })
  })

  it("clears field when values become empty", () => {
    expect(buildMultiSelectArrayFilter("in", [])).toEqual([])
    expect(buildMultiSelectArrayFilter("notIn", [])).toEqual([])
    expect(buildMultiSelectArrayFilter("all", [])).toEqual([])
  })
})
