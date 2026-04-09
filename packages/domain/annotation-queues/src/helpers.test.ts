import { describe, expect, it } from "vitest"
import { annotationQueueItemStatus, annotationQueueItemStatusRankFromTimestamps } from "./helpers.ts"

const d = (s: string) => new Date(s)

describe("annotationQueueItemStatus", () => {
  it("returns completed when completedAt is set", () => {
    expect(annotationQueueItemStatus({ completedAt: d("2026-01-01"), reviewStartedAt: null })).toBe("completed")
  })

  it("returns inProgress when review started but not completed", () => {
    expect(annotationQueueItemStatus({ completedAt: null, reviewStartedAt: d("2026-01-01") })).toBe("inProgress")
  })

  it("returns pending when neither is set", () => {
    expect(annotationQueueItemStatus({ completedAt: null, reviewStartedAt: null })).toBe("pending")
  })
})

describe("annotationQueueItemStatusRankFromTimestamps", () => {
  it("maps to 0 / 1 / 2", () => {
    expect(annotationQueueItemStatusRankFromTimestamps(null, null)).toBe(0)
    expect(annotationQueueItemStatusRankFromTimestamps(null, d("2026-01-01"))).toBe(1)
    expect(annotationQueueItemStatusRankFromTimestamps(d("2026-01-01"), null)).toBe(2)
  })
})
