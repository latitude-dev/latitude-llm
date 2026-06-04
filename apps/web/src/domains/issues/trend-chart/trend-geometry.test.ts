import { describe, expect, it } from "vitest"
import {
  buildSmoothThresholdPath,
  buildThresholdSegments,
  computeTrendMaxCount,
  MAX_VISIBLE_BAR_HEIGHT_PERCENT,
  MIN_VISIBLE_BAR_HEIGHT_PERCENT,
  type TrendGeometryPoint,
  toVisibleHeightPercent,
} from "./trend-geometry.ts"

describe("toVisibleHeightPercent", () => {
  it("maps zero to zero (no bar)", () => {
    expect(toVisibleHeightPercent(0, 10)).toBe(0)
  })

  it("clamps any positive count up to the minimum visible height", () => {
    // 1/100 would be 0.88% — clamped up so the bar stays legible.
    expect(toVisibleHeightPercent(1, 100)).toBe(MIN_VISIBLE_BAR_HEIGHT_PERCENT)
  })

  it("scales the max count to the ceiling", () => {
    expect(toVisibleHeightPercent(10, 10)).toBe(MAX_VISIBLE_BAR_HEIGHT_PERCENT)
  })
})

describe("computeTrendMaxCount", () => {
  it("takes the largest of counts and thresholds", () => {
    const points: TrendGeometryPoint[] = [
      { count: 3, threshold: 9 },
      { count: 5, threshold: null },
    ]
    expect(computeTrendMaxCount(points)).toBe(9)
  })

  it("floors at 1 for an all-zero window", () => {
    expect(computeTrendMaxCount([{ count: 0, threshold: null }])).toBe(1)
  })
})

describe("buildThresholdSegments", () => {
  it("breaks the line across null thresholds and centers x on the bucket", () => {
    const points: TrendGeometryPoint[] = [
      { count: 0, threshold: 5 },
      { count: 0, threshold: null },
      { count: 0, threshold: 7 },
      { count: 0, threshold: 7 },
    ]
    const segments = buildThresholdSegments(points, 10)
    expect(segments).toHaveLength(2)
    expect(segments[0]).toHaveLength(1)
    expect(segments[1]).toHaveLength(2)
    // x = index + 0.5
    expect(segments[0]?.[0]?.x).toBe(0.5)
    expect(segments[1]?.[0]?.x).toBe(2.5)
    // y = 100 - heightPercent, so a higher threshold sits higher (smaller y).
    expect(segments[1]?.[0]?.y).toBeLessThan(100)
  })

  it("returns no segments when every threshold is null", () => {
    const points: TrendGeometryPoint[] = [
      { count: 3, threshold: null },
      { count: 4, threshold: null },
    ]
    expect(buildThresholdSegments(points, 10)).toEqual([])
  })
})

describe("buildSmoothThresholdPath", () => {
  it("returns an empty string for no points", () => {
    expect(buildSmoothThresholdPath([])).toBe("")
  })

  it("draws a tiny horizontal dash for a single point", () => {
    const d = buildSmoothThresholdPath([{ x: 2, y: 50 }])
    expect(d.startsWith("M ")).toBe(true)
    expect(d).toContain("L ")
  })

  it("emits a cubic Bezier spline for multiple points", () => {
    const d = buildSmoothThresholdPath([
      { x: 0, y: 50 },
      { x: 1, y: 40 },
      { x: 2, y: 45 },
    ])
    expect(d.startsWith("M ")).toBe(true)
    expect(d).toContain("C ")
  })
})
