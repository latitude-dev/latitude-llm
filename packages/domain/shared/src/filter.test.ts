import { describe, expect, it } from "vitest"
import { filterSetSchema } from "./filter.ts"

describe("filterSetSchema", () => {
  it("parses a valid filter set", () => {
    const input = {
      status: [{ op: "in", value: ["error"] }],
      cost: [{ op: "gte", value: 100 }],
    }
    const result = filterSetSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it("rejects invalid operator", () => {
    const input = { status: [{ op: "banana", value: "x" }] }
    const result = filterSetSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects non-object at top level", () => {
    const result = filterSetSchema.safeParse("not an object")
    expect(result.success).toBe(false)
  })

  it("accepts empty object", () => {
    const result = filterSetSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("rejects too many fields", () => {
    const input: Record<string, unknown[]> = {}
    for (let i = 0; i < 31; i++) {
      input[`field${i}`] = [{ op: "eq", value: "x" }]
    }
    const result = filterSetSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects too many conditions per field", () => {
    const conditions = Array.from({ length: 11 }, (_, i) => ({ op: "eq", value: `v${i}` }))
    const result = filterSetSchema.safeParse({ name: conditions })
    expect(result.success).toBe(false)
  })

  it("rejects oversized string values", () => {
    const input = { name: [{ op: "eq", value: "x".repeat(1001) }] }
    const result = filterSetSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects oversized array values", () => {
    const input = { tags: [{ op: "in", value: Array.from({ length: 101 }, (_, i) => `t${i}`) }] }
    const result = filterSetSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects invalid metadata key characters", () => {
    const input = { "metadata.foo bar": [{ op: "eq", value: "x" }] }
    const result = filterSetSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("accepts valid metadata key", () => {
    const input = { "metadata.env": [{ op: "eq", value: "prod" }] }
    const result = filterSetSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it("accepts nested metadata key dot notation", () => {
    const input = { "metadata.runtime.env.name": [{ op: "eq", value: "prod" }] }
    const result = filterSetSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it("rejects metadata key with empty segment", () => {
    const input = { "metadata.runtime..name": [{ op: "eq", value: "prod" }] }
    const result = filterSetSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects metadata key deeper than max nesting", () => {
    const input = {
      "metadata.a.b.c.d.e.f.g.h.i.j.k.l.m": [{ op: "eq", value: "prod" }],
    }
    const result = filterSetSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects like operator (removed)", () => {
    const input = { name: [{ op: "like", value: "%test%" }] }
    const result = filterSetSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})
