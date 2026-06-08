import { describe, expect, it } from "vitest"
import {
  countFailingBuckets,
  ESCALATING_BUCKET_LARGE_MS,
  ESCALATING_BUCKET_SIZE_CUTOFF_MS,
  ESCALATING_BUCKET_SMALL_MS,
  maxFailingBuckets,
  pickEscalatingBucketMs,
} from "./constants.ts"

describe("pickEscalatingBucketMs", () => {
  it("uses 1-min buckets up to and including the 15-min cutoff", () => {
    expect(pickEscalatingBucketMs(5 * 60_000)).toBe(ESCALATING_BUCKET_SMALL_MS)
    expect(pickEscalatingBucketMs(ESCALATING_BUCKET_SIZE_CUTOFF_MS)).toBe(ESCALATING_BUCKET_SMALL_MS)
  })

  it("uses 5-min buckets beyond the cutoff", () => {
    expect(pickEscalatingBucketMs(ESCALATING_BUCKET_SIZE_CUTOFF_MS + 1)).toBe(ESCALATING_BUCKET_LARGE_MS)
    expect(pickEscalatingBucketMs(60 * 60_000)).toBe(ESCALATING_BUCKET_LARGE_MS)
  })
})

describe("maxFailingBuckets", () => {
  it("floors to at least one bucket of slack for any positive tolerance", () => {
    // floor(0.1 × 5) = 0, but the min-1 floor keeps short windows from being strict.
    expect(maxFailingBuckets(5, 0.1)).toBe(1)
    expect(maxFailingBuckets(10, 0.1)).toBe(1)
    expect(maxFailingBuckets(12, 0.1)).toBe(1)
  })

  it("lets the fraction dominate the floor on large windows", () => {
    expect(maxFailingBuckets(24, 0.1)).toBe(2)
    expect(maxFailingBuckets(50, 0.1)).toBe(5)
  })

  it("is strict (zero slack) when the tolerance is 0", () => {
    expect(maxFailingBuckets(5, 0)).toBe(0)
    expect(maxFailingBuckets(24, 0)).toBe(0)
  })

  it("defaults to the configured tolerance", () => {
    expect(maxFailingBuckets(24)).toBe(2)
  })
})

describe("countFailingBuckets", () => {
  it("fails buckets below the threshold", () => {
    expect(countFailingBuckets([3, 2, 1, 0], 2)).toBe(2) // 1 and 0 fail
  })

  it("always fails an empty bucket, even when the threshold is 0", () => {
    expect(countFailingBuckets([0, 1, 2], 0)).toBe(1) // the 0 bucket fails despite a 0 threshold
  })

  it("passes a bucket that meets the threshold exactly", () => {
    expect(countFailingBuckets([2, 2, 2], 2)).toBe(0)
  })
})
