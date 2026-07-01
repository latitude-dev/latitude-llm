import { describe, expect, it } from "vitest"
import { ANALYTICS_DEFAULT_LIMIT, analyticsQuerySchema, isValidAnalyticsRange } from "./analytics-query.ts"

const range = { fromIso: "2026-06-23T00:00:00.000Z", toIso: "2026-06-30T00:00:00.000Z" }

describe("analyticsQuerySchema", () => {
  it("accepts a metric-only traces query and applies defaults", () => {
    const parsed = analyticsQuerySchema.parse({ stream: "traces", metric: { kind: "count" }, range })
    expect(parsed.limit).toBe(ANALYTICS_DEFAULT_LIMIT)
    expect(parsed.orderBy).toEqual({ by: "value", direction: "desc" })
  })

  it("accepts a traces breakdown + time bucket", () => {
    const parsed = analyticsQuerySchema.parse({
      stream: "traces",
      metric: { kind: "errorRate" },
      breakdown: "model",
      timeBucket: { unit: "week" },
      range,
    })
    expect(parsed).toMatchObject({ stream: "traces", breakdown: "model", timeBucket: { unit: "week", size: 1 } })
  })

  it("rejects an unknown breakdown for traces", () => {
    const result = analyticsQuerySchema.safeParse({
      stream: "traces",
      metric: { kind: "count" },
      breakdown: "country",
      range,
    })
    expect(result.success).toBe(false)
  })

  it("accepts a breakdown on sessions (shares the trace rollup dims minus name)", () => {
    expect(
      analyticsQuerySchema.safeParse({ stream: "sessions", metric: { kind: "count" }, breakdown: "model", range })
        .success,
    ).toBe(true)
    // `name` is traces-only — a session has no single root span.
    expect(
      analyticsQuerySchema.safeParse({ stream: "sessions", metric: { kind: "count" }, breakdown: "name", range })
        .success,
    ).toBe(false)
  })

  it("accepts a breakdown on spans, including the span-only `operation`", () => {
    expect(
      analyticsQuerySchema.safeParse({ stream: "spans", metric: { kind: "count" }, breakdown: "operation", range })
        .success,
    ).toBe(true)
    expect(
      analyticsQuerySchema.safeParse({ stream: "spans", metric: { kind: "count" }, breakdown: "userId", range })
        .success,
    ).toBe(false)
  })

  it("accepts a semantic query on sessions (session search is supported)", () => {
    const result = analyticsQuerySchema.safeParse({
      stream: "sessions",
      metric: { kind: "count" },
      query: "refund failed",
      range,
    })
    expect(result.success).toBe(true)
  })

  it("rejects a semantic query on spans (no semantic search)", () => {
    const result = analyticsQuerySchema.safeParse({
      stream: "spans",
      metric: { kind: "count" },
      query: "refund failed",
      range,
    })
    expect(result.success).toBe(false)
  })

  it("accepts scores metrics + signal breakdowns (the signal grain)", () => {
    expect(
      analyticsQuerySchema.safeParse({ stream: "scores", metric: { kind: "count" }, breakdown: "signalId", range })
        .success,
    ).toBe(true)
    expect(analyticsQuerySchema.safeParse({ stream: "scores", metric: { kind: "passRate" }, range }).success).toBe(true)
    expect(
      analyticsQuerySchema.safeParse({
        stream: "scores",
        metric: { kind: "avg", field: "value" },
        breakdown: "model",
        range,
      }).success,
    ).toBe(true)
  })

  it("rejects trace-family metrics / query / span dims on the scores stream", () => {
    // scores has no duration/cost/tokens metrics, no cacheHitRate, no semantic query.
    expect(
      analyticsQuerySchema.safeParse({ stream: "scores", metric: { kind: "sum", field: "duration" }, range }).success,
    ).toBe(false)
    expect(analyticsQuerySchema.safeParse({ stream: "scores", metric: { kind: "cacheHitRate" }, range }).success).toBe(
      false,
    )
    expect(
      analyticsQuerySchema.safeParse({ stream: "scores", metric: { kind: "count" }, query: "x", range }).success,
    ).toBe(false)
    expect(
      analyticsQuerySchema.safeParse({ stream: "scores", metric: { kind: "count" }, breakdown: "operation", range })
        .success,
    ).toBe(false)
  })

  it("caps the limit", () => {
    const result = analyticsQuerySchema.safeParse({
      stream: "traces",
      metric: { kind: "count" },
      range,
      limit: 100_000,
    })
    expect(result.success).toBe(false)
  })

  it("isValidAnalyticsRange rejects an inverted range", () => {
    expect(isValidAnalyticsRange(range)).toBe(true)
    expect(isValidAnalyticsRange({ fromIso: range.toIso, toIso: range.fromIso })).toBe(false)
  })
})
