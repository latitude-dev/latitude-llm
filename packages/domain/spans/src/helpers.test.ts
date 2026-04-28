import { describe, expect, it } from "vitest"
import {
  alignUnixSecondsToHistogramBucket,
  denseTraceTimeHistogramBuckets,
  pickTraceHistogramBucketSeconds,
} from "./helpers.ts"
import { emptyTraceTimeHistogramBucket } from "./ports/trace-repository.ts"

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
  it("fills missing buckets with zero across all metric fields", () => {
    const rangeStartIso = "2024-06-01T10:00:00.000Z"
    const rangeEndIso = "2024-06-01T12:00:00.000Z"
    const populated = {
      bucketStart: "2024-06-01T11:00:00.000Z",
      traceCount: 7,
      costTotalMicrocentsSum: 1234,
      durationNsMedian: 5_000_000,
      tokensTotalSum: 200,
      spanCountSum: 14,
      timeToFirstTokenNsMedian: 3_000_000,
    }
    const dense = denseTraceTimeHistogramBuckets([populated], rangeStartIso, rangeEndIso, 3600)
    expect(dense).toHaveLength(3)
    expect(dense[0]).toEqual(emptyTraceTimeHistogramBucket("2024-06-01T10:00:00.000Z"))
    expect(dense[1]).toEqual(populated)
    expect(dense[2]).toEqual(emptyTraceTimeHistogramBucket("2024-06-01T12:00:00.000Z"))
  })

  it("returns all-zero buckets across every metric when sparse is empty", () => {
    const rangeStartIso = "2024-06-01T00:00:00.000Z"
    const rangeEndIso = "2024-06-01T01:00:00.000Z"
    const dense = denseTraceTimeHistogramBuckets(undefined, rangeStartIso, rangeEndIso, 3600)
    expect(dense).toHaveLength(2)
    for (const bucket of dense) {
      expect(bucket.traceCount).toBe(0)
      expect(bucket.costTotalMicrocentsSum).toBe(0)
      expect(bucket.durationNsMedian).toBe(0)
      expect(bucket.tokensTotalSum).toBe(0)
      expect(bucket.spanCountSum).toBe(0)
      expect(bucket.timeToFirstTokenNsMedian).toBe(0)
    }
  })

  it("returns empty array for invalid range", () => {
    expect(denseTraceTimeHistogramBuckets([], "2024-06-01T00:00:00.000Z", "2024-06-01T00:00:00.000Z", 60)).toEqual([])
    expect(denseTraceTimeHistogramBuckets([], "not-a-date", "2024-06-01T01:00:00.000Z", 60)).toEqual([])
  })

  it("merges duplicate aligned sparse rows: sums additive fields, keeps max for medians", () => {
    // ClickHouse GROUP BY guarantees one sparse row per aligned bucket, so this defensive fold
    // is unreachable in practice. When it does fire, additive fields combine; medians can't be
    // re-derived from two pre-computed medians, so we take the max as a safe upper bound rather
    // than producing a meaningless sum.
    const rangeStartIso = "2024-06-01T10:00:00.000Z"
    const rangeEndIso = "2024-06-01T10:59:59.999Z"
    const sparse = [
      {
        bucketStart: "2024-06-01T10:00:00.000Z",
        traceCount: 2,
        costTotalMicrocentsSum: 100,
        durationNsMedian: 1_000,
        tokensTotalSum: 30,
        spanCountSum: 4,
        timeToFirstTokenNsMedian: 500,
      },
      {
        bucketStart: "2024-06-01T10:00:00.123Z",
        traceCount: 3,
        costTotalMicrocentsSum: 200,
        durationNsMedian: 2_000,
        tokensTotalSum: 70,
        spanCountSum: 6,
        timeToFirstTokenNsMedian: 1_500,
      },
    ]
    const dense = denseTraceTimeHistogramBuckets(sparse, rangeStartIso, rangeEndIso, 3600)
    expect(dense).toHaveLength(1)
    expect(dense[0]).toEqual({
      bucketStart: "2024-06-01T10:00:00.000Z",
      traceCount: 5,
      costTotalMicrocentsSum: 300,
      durationNsMedian: 2_000,
      tokensTotalSum: 100,
      spanCountSum: 10,
      timeToFirstTokenNsMedian: 1_500,
    })
  })
})
