import { COST_PER_CALL_MIN_SAMPLE_CALLS, type CostBreakdown } from "@domain/spans"
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
  splitBreakdownRows,
} from "./cost-formatters.ts"

const bucket = (bucketStartIso: string, valueMicrocents: number) => ({
  bucketStartIso,
  valueMicrocents,
  byModel: [],
})

const breakdownRow = (key: string, totalMicrocents: number, calls: number) => ({
  key,
  totalMicrocents,
  inputMicrocents: totalMicrocents / 2,
  outputMicrocents: totalMicrocents * 0.3,
  cacheAndOtherMicrocents: totalMicrocents * 0.2,
  calls,
  tokens: calls * 100,
  unpricedTokens: 0,
  unpricedCalls: 0,
  unknownTokens: 0,
  unknownCalls: 0,
  tracesWithValue: calls,
  avgPerTraceMicrocents: calls > 0 ? totalMicrocents / calls : 0,
})

// Four values summing to the totals, so a remainder can be checked against them.
const breakdownFixture: CostBreakdown = {
  rows: [
    breakdownRow("a", 6_000, 600),
    breakdownRow("b", 3_700, 370),
    breakdownRow("c", 200, 20),
    breakdownRow("d", 100, 10),
  ],
  totals: {
    totalMicrocents: 10_000,
    inputMicrocents: 5_000,
    outputMicrocents: 3_000,
    cacheAndOtherMicrocents: 2_000,
    calls: 1_000,
    tokens: 100_000,
    unpricedTokens: 0,
    unpricedCalls: 0,
    unknownTokens: 0,
    unknownCalls: 0,
    tracesWithUsage: 800,
    avgPerCallMicrocents: 10,
    distinctValues: 4,
  },
}

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
    expect(
      costPerCallMultiple({
        totalMicrocents: 100 * COST_PER_CALL_MIN_SAMPLE_CALLS,
        calls: COST_PER_CALL_MIN_SAMPLE_CALLS,
        avgPerCallMicrocents: 50,
      }),
    ).toBe(2)
  })

  it("withholds the ratio below the sample floor", () => {
    // The shape that produced `278x avg` on a single trace: real arithmetic, no finding.
    expect(
      costPerCallMultiple({
        totalMicrocents: 16_000_000,
        calls: COST_PER_CALL_MIN_SAMPLE_CALLS - 1,
        avgPerCallMicrocents: 56_000,
      }),
    ).toBeNull()
  })

  it("withholds the ratio on a row that spent nothing", () => {
    // Otherwise these read `0.0x avg`, which looks like a measurement.
    expect(costPerCallMultiple({ totalMicrocents: 0, calls: 5_000, avgPerCallMicrocents: 56_000 })).toBeNull()
  })

  it("has no baseline when nothing was called or the window spent nothing", () => {
    expect(costPerCallMultiple({ totalMicrocents: 1_000, calls: 0, avgPerCallMicrocents: 50 })).toBeNull()
    expect(costPerCallMultiple({ totalMicrocents: 1_000, calls: 100, avgPerCallMicrocents: 0 })).toBeNull()
  })
})

describe("splitBreakdownRows", () => {
  it("closes the remainder against the window totals", () => {
    const split = splitBreakdownRows({ breakdown: breakdownFixture, limit: 2 })

    expect(split.visible.map((row) => row.key)).toEqual(["a", "b"])
    expect(split.remainder).toMatchObject({
      valueCount: 2,
      totalMicrocents: 300,
      inputMicrocents: 150,
      outputMicrocents: 90,
      calls: 30,
    })
  })

  it("covers the query's own truncation in the remainder", () => {
    // Four values returned, six exist: the remainder has to speak for both the rows
    // below the cut and the two the query never returned.
    const truncated = {
      ...breakdownFixture,
      totals: { ...breakdownFixture.totals, distinctValues: 6 },
    }

    expect(splitBreakdownRows({ breakdown: truncated, limit: 4 }).remainder).toMatchObject({
      valueCount: 2,
      totalMicrocents: 0,
    })
  })

  it("has no remainder when every value is shown", () => {
    expect(splitBreakdownRows({ breakdown: breakdownFixture, limit: 10 }).remainder).toBeNull()
  })

  it("folds values too small to read as a proportion into the remainder", () => {
    const split = splitBreakdownRows({ breakdown: breakdownFixture, limit: 10, minShare: 0.1 })

    // `c` and `d` are 2% and 1% of both spend and calls — two invisible slivers.
    expect(split.visible.map((row) => row.key)).toEqual(["a", "b"])
    expect(split.remainder?.valueCount).toBe(2)
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
