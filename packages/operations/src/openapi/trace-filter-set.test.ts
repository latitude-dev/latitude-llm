import { describe, expect, it } from "vitest"
import { TraceFilterSetSchema } from "./schemas.ts"

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
})
