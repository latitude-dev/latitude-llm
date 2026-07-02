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

  it("accepts p95 over a trace-family field, but not on scores (its own vocabulary)", () => {
    expect(
      analyticsQuerySchema.safeParse({ stream: "traces", metric: { kind: "p95", field: "duration" }, range }).success,
    ).toBe(true)
    // p95 requires a field, like the other stat metrics.
    expect(analyticsQuerySchema.safeParse({ stream: "traces", metric: { kind: "p95" }, range }).success).toBe(false)
    // scores/behaviors/moments have their own metric schemas without p95.
    expect(
      analyticsQuerySchema.safeParse({ stream: "scores", metric: { kind: "p95", field: "value" }, range }).success,
    ).toBe(false)
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

  it("accepts behaviors metrics + cluster/session/method breakdowns", () => {
    expect(
      analyticsQuerySchema.safeParse({ stream: "behaviors", metric: { kind: "count" }, breakdown: "cluster", range })
        .success,
    ).toBe(true)
    expect(
      analyticsQuerySchema.safeParse({ stream: "behaviors", metric: { kind: "avg", field: "confidence" }, range })
        .success,
    ).toBe(true)
  })

  it("rejects trace-family / scores shapes on the behaviors stream", () => {
    expect(analyticsQuerySchema.safeParse({ stream: "behaviors", metric: { kind: "errorRate" }, range }).success).toBe(
      false,
    )
    expect(
      analyticsQuerySchema.safeParse({ stream: "behaviors", metric: { kind: "avg", field: "value" }, range }).success,
    ).toBe(false)
    expect(
      analyticsQuerySchema.safeParse({ stream: "behaviors", metric: { kind: "count" }, query: "x", range }).success,
    ).toBe(false)
    expect(
      analyticsQuerySchema.safeParse({ stream: "behaviors", metric: { kind: "count" }, breakdown: "model", range })
        .success,
    ).toBe(false)
  })

  it("accepts moments metrics + kind/actor/session breakdowns", () => {
    expect(
      analyticsQuerySchema.safeParse({ stream: "moments", metric: { kind: "count" }, breakdown: "kind", range })
        .success,
    ).toBe(true)
    expect(
      analyticsQuerySchema.safeParse({ stream: "moments", metric: { kind: "avg", field: "confidence" }, range })
        .success,
    ).toBe(true)
    expect(
      analyticsQuerySchema.safeParse({
        stream: "moments",
        metric: { kind: "median", field: "coherence" },
        breakdown: "actor",
        range,
      }).success,
    ).toBe(true)
  })

  it("rejects trace-family / scores shapes on the moments stream", () => {
    expect(analyticsQuerySchema.safeParse({ stream: "moments", metric: { kind: "errorRate" }, range }).success).toBe(
      false,
    )
    expect(
      analyticsQuerySchema.safeParse({ stream: "moments", metric: { kind: "avg", field: "value" }, range }).success,
    ).toBe(false)
    expect(
      analyticsQuerySchema.safeParse({ stream: "moments", metric: { kind: "count" }, query: "x", range }).success,
    ).toBe(false)
    expect(
      analyticsQuerySchema.safeParse({ stream: "moments", metric: { kind: "count" }, breakdown: "model", range })
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
