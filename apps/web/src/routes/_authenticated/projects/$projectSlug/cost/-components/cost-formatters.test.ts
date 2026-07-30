import { describe, expect, it } from "vitest"
import {
  computeDailyAverageMicrocents,
  costPerCallMultiple,
  DAY_SECONDS,
  densifyCostBuckets,
  densifyModelUsageBuckets,
  formatCostMultiple,
  formatUtcBucketLabel,
  pickCostBucketSeconds,
  resolveIncompleteBucketIndex,
  shareOf,
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

describe("densifyModelUsageBuckets", () => {
  it("fills quiet buckets with an empty model set rather than closing the gap", () => {
    const dense = densifyModelUsageBuckets({
      buckets: [
        {
          bucketStartIso: "2026-07-20T00:00:00.000Z",
          byModel: [{ model: "gpt-4o", costMicrocents: 500, tokens: 10 }],
          other: { costMicrocents: 5, tokens: 1 },
        },
      ],
      fromIso: "2026-07-19T00:00:00.000Z",
      toIso: "2026-07-21T00:00:00.000Z",
      bucketSeconds: DAY_SECONDS,
    })

    expect(dense.map((b) => b.bucketStartIso)).toEqual(["2026-07-19T00:00:00.000Z", "2026-07-20T00:00:00.000Z"])
    expect(dense[0]).toEqual({
      bucketStartIso: "2026-07-19T00:00:00.000Z",
      byModel: [],
      other: { costMicrocents: 0, tokens: 0 },
    })
  })
})

describe("shareOf", () => {
  it("is null without a denominator, so an unknown share never reads as 0%", () => {
    expect(shareOf(0, 0)).toBeNull()
    expect(shareOf(3, 12)).toBe(0.25)
  })
})

describe("costPerCallMultiple", () => {
  it("compares a row's cost per call against the window average", () => {
    expect(costPerCallMultiple({ totalMicrocents: 1_000, calls: 10, avgPerCallMicrocents: 50 })).toBe(2)
  })

  it("has no baseline when nothing was called or nothing was spent", () => {
    expect(costPerCallMultiple({ totalMicrocents: 1_000, calls: 0, avgPerCallMicrocents: 50 })).toBeNull()
    expect(costPerCallMultiple({ totalMicrocents: 0, calls: 10, avgPerCallMicrocents: 0 })).toBeNull()
  })
})

describe("formatCostMultiple", () => {
  it("keeps a decimal where the comparison is close and drops it where it is not", () => {
    expect(formatCostMultiple(2.34)).toBe("2.3×")
    expect(formatCostMultiple(0.3)).toBe("0.3×")
    expect(formatCostMultiple(41.6)).toBe("42×")
  })

  it("does not round a real difference down to zero", () => {
    expect(formatCostMultiple(0.004)).toBe("<0.1×")
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
