import { describe, expect, it } from "vitest"
import { TraceFilterSetSchema, TraceRefSchema, TracesRefSchema } from "./schemas.ts"

describe("TraceFilterSetSchema", () => {
  it("accepts the documented telemetry, time-window, score, and metadata fields", () => {
    const result = TraceFilterSetSchema.safeParse({
      status: [{ op: "in", value: ["error"] }],
      startTime: [{ op: "gte", value: "2026-01-01T00:00:00Z" }],
      endTime: [{ op: "lte", value: "2026-01-02T00:00:00Z" }],
      "score.passed": [{ op: "eq", value: true }],
      "metadata.env": [{ op: "eq", value: "prod" }],
    })
    expect(result.success).toBe(true)
  })

  it("rejects an unrecognized field instead of silently dropping it", () => {
    const result = TraceFilterSetSchema.safeParse({
      endTimee: [{ op: "lte", value: "2026-01-01T00:00:00Z" }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["endTimee"])
      expect(result.error.issues[0]?.message).toContain("Unknown trace filter field")
    }
  })

  it("reports every unknown field, keeping the valid ones implicit", () => {
    const result = TraceFilterSetSchema.safeParse({
      startTime: [{ op: "gte", value: "2026-01-01T00:00:00Z" }],
      finishedAt: [{ op: "lte", value: "2026-01-02T00:00:00Z" }],
      "score.bogus": [{ op: "eq", value: 1 }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const badPaths = result.error.issues.map((issue) => issue.path.join("."))
      expect(badPaths.sort()).toEqual(["finishedAt", "score.bogus"])
    }
  })

  it("rejects gtePercentile on startTime/endTime (percentile resolution only covers duration/ttft/cost)", () => {
    for (const field of ["startTime", "endTime"] as const) {
      const result = TraceFilterSetSchema.safeParse({ [field]: [{ op: "gtePercentile", value: 95 }] })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual([field, 0, "op"])
        expect(result.error.issues[0]?.message).toContain("gtePercentile")
      }
    }
  })
})

describe("TraceRefSchema / TracesRefSchema filter validation", () => {
  const traceId = "a".repeat(32)

  it("accepts the id branch and a valid filter set", () => {
    expect(TraceRefSchema.safeParse({ by: "id", id: traceId }).success).toBe(true)
    expect(
      TraceRefSchema.safeParse({ by: "filters", filters: { status: [{ op: "eq", value: "error" }] } }).success,
    ).toBe(true)
    expect(TracesRefSchema.safeParse({ by: "ids", ids: [traceId] }).success).toBe(true)
  })

  it("rejects an unknown filter field in the filters branch (single + plural)", () => {
    const single = TraceRefSchema.safeParse({ by: "filters", filters: { finishedAt: [{ op: "lte", value: 1 }] } })
    expect(single.success).toBe(false)
    if (!single.success) expect(single.error.issues[0]?.path).toEqual(["filters", "finishedAt"])

    const plural = TracesRefSchema.safeParse({ by: "filters", filters: { finishedAt: [{ op: "lte", value: 1 }] } })
    expect(plural.success).toBe(false)
    if (!plural.success) expect(plural.error.issues[0]?.path).toEqual(["filters", "finishedAt"])
  })
})
