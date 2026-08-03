import { describe, expect, it } from "vitest"
import { SessionFilterSetSchema } from "./schemas.ts"

describe("SessionFilterSetSchema", () => {
  it("accepts the session-only conversation-intelligence fields (moments, topics) that traces reject", () => {
    const result = SessionFilterSetSchema.safeParse({
      moments: [{ op: "in", value: ["escalation", "user_frustration"] }],
      topics: [{ op: "in", value: ["cluster-abc"] }],
    })
    expect(result.success).toBe(true)
  })

  it("accepts the telemetry, time-window, score, and metadata fields", () => {
    const result = SessionFilterSetSchema.safeParse({
      status: [{ op: "in", value: ["error"] }],
      userId: [{ op: "eq", value: "u-1" }],
      startTime: [{ op: "gte", value: "2026-01-01T00:00:00Z" }],
      endTime: [{ op: "lte", value: "2026-01-02T00:00:00Z" }],
      "score.passed": [{ op: "eq", value: true }],
      "metadata.env": [{ op: "eq", value: "prod" }],
    })
    expect(result.success).toBe(true)
  })

  it("rejects `traceCount` / `hasLlmActivity` — the session UI does not offer them", () => {
    for (const field of ["traceCount", "hasLlmActivity"] as const) {
      const result = SessionFilterSetSchema.safeParse({ [field]: [{ op: "eq", value: 1 }] })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual([field])
        expect(result.error.issues[0]?.message).toContain("Unknown session filter field")
      }
    }
  })

  it("rejects an unrecognized field instead of silently dropping it", () => {
    const result = SessionFilterSetSchema.safeParse({
      bogusField: [{ op: "eq", value: 1 }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["bogusField"])
      expect(result.error.issues[0]?.message).toContain("Unknown session filter field")
    }
  })

  it("rejects gtePercentile on non-percentile-eligible fields", () => {
    for (const field of ["tokensInput", "spanCount", "startTime", "score.value"] as const) {
      const result = SessionFilterSetSchema.safeParse({ [field]: [{ op: "gtePercentile", value: 95 }] })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual([field, 0, "op"])
        expect(result.error.issues[0]?.message).toContain("gtePercentile is only supported on")
      }
    }
  })

  it("accepts gtePercentile on the percentile-eligible fields", () => {
    for (const field of ["duration", "ttft", "cost"] as const) {
      const result = SessionFilterSetSchema.safeParse({ [field]: [{ op: "gtePercentile", value: 95 }] })
      expect(result.success).toBe(true)
    }
  })
})
