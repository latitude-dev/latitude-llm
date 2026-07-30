import { describe, expect, it } from "vitest"
import {
  computeDailyAverageMicrocents,
  DAY_SECONDS,
  densifyCostBuckets,
  formatUtcBucketLabel,
  pickCostBucketSeconds,
  resolveIncompleteBucketIndex,
} from "./cost-formatters.ts"

const bucket = (bucketStartIso: string, valueMicrocents: number) => ({
  bucketStartIso,
  valueMicrocents,
  byModel: [],
})

describe("pickCostBucketSeconds", () => {
  it("uses hours only for windows too short to hold a day", () => {
    expect(pickCostBucketSeconds(12 * 60 * 60 * 1000)).toBe(60 * 60)
    expect(pickCostBucketSeconds(7 * DAY_SECONDS * 1000)).toBe(DAY_SECONDS)
    expect(pickCostBucketSeconds(365 * DAY_SECONDS * 1000)).toBe(7 * DAY_SECONDS)
  })
})

describe("densifyCostBuckets", () => {
  it("fills days with no spend as zero", () => {
    const dense = densifyCostBuckets({
      buckets: [bucket("2026-07-20T00:00:00.000Z", 500)],
      fromIso: "2026-07-19T00:00:00.000Z",
      toIso: "2026-07-22T00:00:00.000Z",
      bucketSeconds: DAY_SECONDS,
    })

    expect(dense.map((b) => b.valueMicrocents)).toEqual([0, 500, 0])
    expect(dense[0]?.bucketStartIso).toBe("2026-07-19T00:00:00.000Z")
  })
})

describe("resolveIncompleteBucketIndex", () => {
  it("flags the bucket that has not finished yet", () => {
    const buckets = [bucket("2026-07-20T00:00:00.000Z", 1), bucket("2026-07-21T00:00:00.000Z", 1)]

    expect(
      resolveIncompleteBucketIndex({
        buckets,
        bucketSeconds: DAY_SECONDS,
        toIso: "2026-07-21T10:00:00.000Z",
        nowMs: Date.parse("2026-07-21T10:00:00.000Z"),
      }),
    ).toBe(1)
  })

  it("leaves a window that ends on a bucket boundary alone", () => {
    const buckets = [bucket("2026-07-20T00:00:00.000Z", 1)]

    expect(
      resolveIncompleteBucketIndex({
        buckets,
        bucketSeconds: DAY_SECONDS,
        toIso: "2026-07-21T00:00:00.000Z",
        nowMs: Date.parse("2026-07-25T00:00:00.000Z"),
      }),
    ).toBeUndefined()
  })
})

describe("computeDailyAverageMicrocents", () => {
  it("divides by completed days only, ignoring the partial edges", () => {
    const buckets = [
      // Partial leading bucket: starts before the window.
      bucket("2026-07-19T00:00:00.000Z", 999),
      bucket("2026-07-20T00:00:00.000Z", 100),
      bucket("2026-07-21T00:00:00.000Z", 300),
      // Still filling.
      bucket("2026-07-22T00:00:00.000Z", 5),
    ]

    expect(
      computeDailyAverageMicrocents({
        buckets,
        bucketSeconds: DAY_SECONDS,
        fromIso: "2026-07-19T09:00:00.000Z",
        toIso: "2026-07-22T09:00:00.000Z",
        nowMs: Date.parse("2026-07-22T09:00:00.000Z"),
      }),
    ).toBe(200)
  })

  it("counts quiet days the grouped query omitted", () => {
    // Only two of the six completed days recorded spend. Dividing by the rows
    // present would read 0.92/day on a week that actually averaged 0.31.
    const sparse = [bucket("2026-07-24T00:00:00.000Z", 81), bucket("2026-07-29T00:00:00.000Z", 103)]

    expect(
      computeDailyAverageMicrocents({
        buckets: sparse,
        bucketSeconds: DAY_SECONDS,
        fromIso: "2026-07-23T10:00:00.000Z",
        toIso: "2026-07-30T10:00:00.000Z",
        nowMs: Date.parse("2026-07-30T10:00:00.000Z"),
      }),
    ).toBeCloseTo((81 + 103) / 6)
  })

  it("has nothing to average before a full day has elapsed", () => {
    expect(
      computeDailyAverageMicrocents({
        buckets: [bucket("2026-07-22T00:00:00.000Z", 100), bucket("2026-07-22T01:00:00.000Z", 100)],
        bucketSeconds: 60 * 60,
        fromIso: "2026-07-22T00:00:00.000Z",
        toIso: "2026-07-22T02:00:00.000Z",
        nowMs: Date.parse("2026-07-22T02:00:00.000Z"),
      }),
    ).toBeNull()
  })
})

describe("formatUtcBucketLabel", () => {
  it("labels a UTC day bucket as that UTC day", () => {
    expect(formatUtcBucketLabel("2026-07-14T00:00:00.000Z", DAY_SECONDS)).toBe("Jul 14")
  })
})
