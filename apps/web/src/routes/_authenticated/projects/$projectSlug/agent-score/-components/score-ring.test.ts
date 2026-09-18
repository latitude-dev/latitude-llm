import { describe, expect, it } from "vitest"
import { buildWeightedRingSegments, DIMENSION_SEGMENT_GAP_RATIO } from "./score-ring.tsx"

const dimensions = [
  { id: "outcome", weight: 0.35, score: 80 },
  { id: "reliability", weight: 0.25, score: 70 },
  { id: "cost", weight: 0.15, score: 60 },
  { id: "speed", weight: 0.15, score: 50 },
  { id: "safety", weight: 0.1, score: 40 },
] as const

describe("buildWeightedRingSegments", () => {
  it("allocates each dimension a slot matching its composite weight", () => {
    const ringLength = 1_000
    const segments = buildWeightedRingSegments(dimensions, ringLength)
    const gapLength = ringLength * DIMENSION_SEGMENT_GAP_RATIO

    expect(segments.map((segment) => segment.start - gapLength / 2)).toEqual([0, 350, 600, 750, 900])
    expect(segments.map((segment) => segment.length)).toEqual([310, 210, 110, 110, 60])
  })

  it("normalizes weights while preserving a centered gap in every slot", () => {
    const segments = buildWeightedRingSegments(
      [
        { id: "first", weight: 3, score: null },
        { id: "second", weight: 1, score: null },
      ],
      100,
      0.1,
    )

    expect(segments).toMatchObject([
      { id: "first", start: 5, length: 65 },
      { id: "second", start: 80, length: 15 },
    ])
  })
})
