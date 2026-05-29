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
