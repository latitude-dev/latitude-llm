import { describe, expect, it } from "vitest"
import { filterSetSchema, noMetadataFilterSetSchema, spanRowFilterSetSchema, traceFilterSetSchema } from "./filter.ts"

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

  it("accepts gtePercentile with a valid percentile value", () => {
    const input = { duration: [{ op: "gtePercentile", value: 95 }] }
    const result = filterSetSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it("rejects gtePercentile with non-numeric value", () => {
    const input = { duration: [{ op: "gtePercentile", value: "p99" }] }
    const result = filterSetSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects gtePercentile with value above 100", () => {
    const input = { duration: [{ op: "gtePercentile", value: 101 }] }
    const result = filterSetSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it("rejects gtePercentile with negative value", () => {
    const input = { duration: [{ op: "gtePercentile", value: -1 }] }
    const result = filterSetSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe("spanRowFilterSetSchema", () => {
  it("rejects gtePercentile on span row filters", () => {
    const result = spanRowFilterSetSchema.safeParse({ duration: [{ op: "gtePercentile", value: 90 }] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("gtePercentile is not supported on span row filters")
    }
  })

  it("accepts absolute duration thresholds", () => {
    const result = spanRowFilterSetSchema.safeParse({ duration: [{ op: "gte", value: 1_000_000_000 }] })
    expect(result.success).toBe(true)
  })
})

describe("traceFilterSetSchema", () => {
  it("accepts gtePercentile on the percentile-eligible fields (duration/ttft/cost)", () => {
    for (const field of ["duration", "ttft", "cost"] as const) {
      const result = traceFilterSetSchema.safeParse({ [field]: [{ op: "gtePercentile", value: 95 }] })
      expect(result.success).toBe(true)
    }
  })

  it("rejects gtePercentile on a numeric field that isn't percentile-eligible", () => {
    const result = traceFilterSetSchema.safeParse({ tokensInput: [{ op: "gtePercentile", value: 95 }] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["tokensInput", 0, "op"])
      expect(result.error.issues[0]?.message).toContain("gtePercentile is only supported on")
    }
  })

  it("rejects gtePercentile on startTime/endTime", () => {
    for (const field of ["startTime", "endTime"] as const) {
      const result = traceFilterSetSchema.safeParse({ [field]: [{ op: "gtePercentile", value: 95 }] })
      expect(result.success).toBe(false)
    }
  })

  it("rejects gtePercentile on a metadata key", () => {
    const result = traceFilterSetSchema.safeParse({ "metadata.env": [{ op: "gtePercentile", value: 95 }] })
    expect(result.success).toBe(false)
  })

  it("accepts absolute thresholds on non-percentile-eligible fields", () => {
    const result = traceFilterSetSchema.safeParse({ tokensInput: [{ op: "gte", value: 100 }] })
    expect(result.success).toBe(true)
  })
})

describe("noMetadataFilterSetSchema", () => {
  it("rejects a metadata.* filter key", () => {
    const result = noMetadataFilterSetSchema.safeParse({ "metadata.agentVersion": [{ op: "eq", value: "2" }] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("metadata.* filters are not supported")
    }
  })

  it("rejects a nested metadata.* filter key", () => {
    const result = noMetadataFilterSetSchema.safeParse({ "metadata.runtime.env": [{ op: "eq", value: "prod" }] })
    expect(result.success).toBe(false)
  })

  it("accepts non-metadata filter fields", () => {
    const result = noMetadataFilterSetSchema.safeParse({
      kind: [{ op: "eq", value: "escalation" }],
      confidence: [{ op: "gte", value: 0.5 }],
    })
    expect(result.success).toBe(true)
  })

  it("accepts an empty filter set", () => {
    expect(noMetadataFilterSetSchema.safeParse({}).success).toBe(true)
  })
})
