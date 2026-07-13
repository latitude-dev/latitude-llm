import { describe, expect, it } from "vitest"
import { customBehaviorFilterSetSchema } from "./custom-behavior.ts"

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
