import type { FilterSet } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { customBehaviorFilterSetSchema, stripCustomBehaviorExcludedFields } from "./custom-behavior.ts"

describe("customBehaviorFilterSetSchema", () => {
  it("rejects a filter set containing topics", () => {
    const result = customBehaviorFilterSetSchema.safeParse({
      topics: [{ op: "in", value: ["support"] }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects topics even alongside allowed fields", () => {
    const result = customBehaviorFilterSetSchema.safeParse({
      moments: [{ op: "in", value: ["escalation"] }],
      topics: [{ op: "in", value: ["support"] }],
    })
    expect(result.success).toBe(false)
  })

  it("accepts a filter set with moments", () => {
    const result = customBehaviorFilterSetSchema.safeParse({
      moments: [{ op: "in", value: ["escalation"] }],
    })
    expect(result.success).toBe(true)
  })

  it("accepts an empty filter set", () => {
    const result = customBehaviorFilterSetSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

describe("stripCustomBehaviorExcludedFields", () => {
  it("drops topics while keeping every other field (including moments)", () => {
    const filterSet = {
      topics: [{ op: "in", value: ["support"] }],
      moments: [{ op: "in", value: ["escalation"] }],
      models: [{ op: "in", value: ["gpt-4o"] }],
    } as unknown as FilterSet
    const stripped = stripCustomBehaviorExcludedFields(filterSet)
    expect(Object.hasOwn(stripped, "topics")).toBe(false)
    expect(stripped).toEqual({
      moments: [{ op: "in", value: ["escalation"] }],
      models: [{ op: "in", value: ["gpt-4o"] }],
    })
    // The stripped result must satisfy the custom-behavior contract.
    expect(customBehaviorFilterSetSchema.safeParse(stripped).success).toBe(true)
  })

  it("returns the same set unchanged when topics is absent", () => {
    const filterSet = { moments: [{ op: "in", value: ["escalation"] }] } as unknown as FilterSet
    expect(stripCustomBehaviorExcludedFields(filterSet)).toBe(filterSet)
  })
})
