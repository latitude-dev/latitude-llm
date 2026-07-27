import type { FilterSet } from "@domain/shared"
import { describe, expect, it } from "vitest"
import {
  countCustomBehaviorViews,
  customBehaviorFilterSetEquals,
  customBehaviorFilterSetSchema,
  stripCustomBehaviorExcludedFields,
} from "./custom-behavior.ts"

describe("customBehaviorFilterSetSchema", () => {
  it("rejects a filter set containing topics", () => {
    const result = customBehaviorFilterSetSchema.safeParse({
      topics: [{ op: "in", value: ["support"] }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects moments", () => {
    const result = customBehaviorFilterSetSchema.safeParse({
      moments: [{ op: "in", value: ["escalation"] }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects excluded fields even alongside allowed fields", () => {
    const result = customBehaviorFilterSetSchema.safeParse({
      models: [{ op: "in", value: ["gpt-4o"] }],
      topics: [{ op: "in", value: ["support"] }],
    })
    expect(result.success).toBe(false)
  })

  it("accepts a filter set with allowed fields", () => {
    const result = customBehaviorFilterSetSchema.safeParse({
      models: [{ op: "in", value: ["gpt-4o"] }],
    })
    expect(result.success).toBe(true)
  })

  it("accepts an empty filter set", () => {
    const result = customBehaviorFilterSetSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

describe("stripCustomBehaviorExcludedFields", () => {
  it("drops topics and moments, keeping every other field", () => {
    const filterSet = {
      topics: [{ op: "in", value: ["support"] }],
      moments: [{ op: "in", value: ["escalation"] }],
      models: [{ op: "in", value: ["gpt-4o"] }],
    } as unknown as FilterSet
    const stripped = stripCustomBehaviorExcludedFields(filterSet)
    expect(Object.hasOwn(stripped, "topics")).toBe(false)
    expect(Object.hasOwn(stripped, "moments")).toBe(false)
    expect(stripped).toEqual({
      models: [{ op: "in", value: ["gpt-4o"] }],
    })
    // The stripped result must satisfy the custom-behavior contract.
    expect(customBehaviorFilterSetSchema.safeParse(stripped).success).toBe(true)
  })

  it("returns the same set unchanged when no excluded field is present", () => {
    const filterSet = { models: [{ op: "in", value: ["gpt-4o"] }] } as unknown as FilterSet
    expect(stripCustomBehaviorExcludedFields(filterSet)).toBe(filterSet)
  })
})

describe("countCustomBehaviorViews", () => {
  const filtered = { models: [{ op: "in", value: ["gpt-4o"] }] } as unknown as FilterSet
  const behaviors = [
    // The topic behavior's own views: no facet, but a filter.
    { facetId: null, filterSet: filtered },
    { facetId: null, filterSet: filtered },
    // A facet behavior and one view of it.
    { facetId: "facet-1", filterSet: {} as FilterSet },
    { facetId: "facet-1", filterSet: filtered },
  ] as Parameters<typeof countCustomBehaviorViews>[0]

  it("counts the topic behavior's filtered views under the null facet", () => {
    expect(countCustomBehaviorViews(behaviors, null)).toBe(2)
  })

  it("counts a facet behavior's views without counting the behavior itself", () => {
    expect(countCustomBehaviorViews(behaviors, "facet-1")).toBe(1)
  })

  it("counts nothing for a facet with no views", () => {
    expect(countCustomBehaviorViews(behaviors, "facet-2")).toBe(0)
  })
})

describe("customBehaviorFilterSetEquals", () => {
  it("ignores key order", () => {
    const left = { models: [{ op: "in", value: ["a"] }], users: [{ op: "in", value: ["u"] }] } as unknown as FilterSet
    const right = { users: [{ op: "in", value: ["u"] }], models: [{ op: "in", value: ["a"] }] } as unknown as FilterSet
    expect(customBehaviorFilterSetEquals(left, right)).toBe(true)
  })

  it("separates different conditions", () => {
    const left = { models: [{ op: "in", value: ["a"] }] } as unknown as FilterSet
    const right = { models: [{ op: "in", value: ["b"] }] } as unknown as FilterSet
    expect(customBehaviorFilterSetEquals(left, right)).toBe(false)
  })
})
