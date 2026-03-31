import { describe, expect, it } from "vitest"
import {
  alignUnixSecondsToHistogramBucket,
  denseTraceTimeHistogramBuckets,
  pickTraceHistogramBucketSeconds,
} from "./helpers.ts"

describe("alignUnixSecondsToHistogramBucket", () => {
  it("matches ClickHouse-style intDiv(ts, bs) * bs", () => {
    const bs = 3600
    const t = Date.UTC(2024, 5, 1, 10, 0, 0) / 1000
    expect(alignUnixSecondsToHistogramBucket(t + 90, bs)).toBe(t)
    expect(alignUnixSecondsToHistogramBucket(t, bs)).toBe(t)
  })
})

describe("pickTraceHistogramBucketSeconds", () => {
  it("7d range: ideal ~3.36h, smallest nice step ≥ ideal is 4h", () => {
    const start = Date.UTC(2024, 5, 1, 0, 0, 0)
    const end = start + 7 * 24 * 60 * 60 * 1000
    expect(pickTraceHistogramBucketSeconds(start, end)).toBe(4 * 60 * 60)
  })

  it("picks 1h when ideal equals 1h exactly", () => {
    const rangeMs = 3600 * 50 * 1000
    expect(pickTraceHistogramBucketSeconds(0, rangeMs)).toBe(3600)
  })

  it("skips missing day steps: ideal at 6d width snaps to 7d (no 6d in nice list)", () => {
    const sixDaysSec = 6 * 24 * 60 * 60
    const rangeMs = sixDaysSec * 50 * 1000
    expect(pickTraceHistogramBucketSeconds(0, rangeMs)).toBe(7 * 24 * 60 * 60)
  })

  it("returns 60 when range is zero", () => {
    expect(pickTraceHistogramBucketSeconds(1000, 1000)).toBe(60)
  })
})

describe("denseTraceTimeHistogramBuckets", () => {
  it("fills missing buckets with zero", () => {
    const rangeStartIso = "2024-06-01T10:00:00.000Z"
    const rangeEndIso = "2024-06-01T12:00:00.000Z"
    const sparse = [{ bucketStart: "2024-06-01T11:00:00.000Z", traceCount: 7 }]
    const dense = denseTraceTimeHistogramBuckets(sparse, rangeStartIso, rangeEndIso, 3600)
    expect(dense).toHaveLength(3)
    expect(dense[0]).toEqual({ bucketStart: "2024-06-01T10:00:00.000Z", traceCount: 0 })
    expect(dense[1]).toEqual({ bucketStart: "2024-06-01T11:00:00.000Z", traceCount: 7 })
    expect(dense[2]).toEqual({ bucketStart: "2024-06-01T12:00:00.000Z", traceCount: 0 })
  })

  it("returns all zeros when sparse is empty", () => {
    const rangeStartIso = "2024-06-01T00:00:00.000Z"
    const rangeEndIso = "2024-06-01T01:00:00.000Z"
    const dense = denseTraceTimeHistogramBuckets(undefined, rangeStartIso, rangeEndIso, 3600)
    expect(dense).toHaveLength(2)
    expect(dense.every((b) => b.traceCount === 0)).toBe(true)
  })

  it("returns empty array for invalid range", () => {
    expect(denseTraceTimeHistogramBuckets([], "2024-06-01T00:00:00.000Z", "2024-06-01T00:00:00.000Z", 60)).toEqual([])
    expect(denseTraceTimeHistogramBuckets([], "not-a-date", "2024-06-01T01:00:00.000Z", 60)).toEqual([])
  })

  it("sums duplicate aligned sparse rows", () => {
    const rangeStartIso = "2024-06-01T10:00:00.000Z"
    const rangeEndIso = "2024-06-01T10:59:59.999Z"
    const sparse = [
      { bucketStart: "2024-06-01T10:00:00.000Z", traceCount: 2 },
      { bucketStart: "2024-06-01T10:00:00.123Z", traceCount: 3 },
    ]
    const dense = denseTraceTimeHistogramBuckets(sparse, rangeStartIso, rangeEndIso, 3600)
    expect(dense).toHaveLength(1)
    expect(dense[0]?.traceCount).toBe(5)
  })
})
