import { describe, expect, it } from "vitest"
import { type SparklinePoint, smoothPath } from "./session-sparkline.tsx"

const at = (values: readonly number[]): SparklinePoint[] => values.map((y, x) => ({ x, y }))

interface Cubic {
  readonly from: number
  readonly c1: number
  readonly c2: number
  readonly to: number
}

/**
 * The control points of each cubic, which is all an overshoot check needs: a Bezier
 * curve stays inside the convex hull of its control points, so a segment whose two
 * controls sit within its endpoints cannot leave that range.
 */
function cubics(path: string): Cubic[] {
  const [move, ...rest] = path.split(" C")
  let from = Number(move?.replace("M", "").split(",")[1])
  const segments: Cubic[] = []
  for (const chunk of rest) {
    const [c1, c2, end] = chunk.split(" ")
    const to = Number(end?.split(",")[1])
    segments.push({ from, c1: Number(c1?.split(",")[1]), c2: Number(c2?.split(",")[1]), to })
    from = to
  }
  return segments
}

const overshoots = (path: string): boolean =>
  cubics(path).some((cubic) => {
    const low = Math.min(cubic.from, cubic.to)
    const high = Math.max(cubic.from, cubic.to)
    return cubic.c1 < low || cubic.c1 > high || cubic.c2 < low || cubic.c2 > high
  })

describe("smoothPath", () => {
  it("rounds the corners rather than drawing straight segments", () => {
    const path = smoothPath(at([0, 4, 6, 6, 2]))

    expect(path.startsWith("M")).toBe(true)
    expect(path).toContain("C")
    expect(path).not.toContain("L")
  })

  /**
   * The reason this is a monotone cubic and not a cardinal spline: a spike in an
   * otherwise flat run makes those overshoot past the peak on the way in and dip
   * under the plateau on the way out, drawing values the series never held.
   */
  it("never leaves the range of the two points it is drawn between", () => {
    const shapes = [
      [10, 10, 10, 16, 10, 10, 10],
      [10, 10, 4, 10, 10],
      [16, 4, 16, 4, 16, 4],
      [0, 0, 0, 20, 0, 0],
      [1, 2, 3, 4, 5, 4, 3, 2, 1],
      [5, 5, 5, 5, 5],
    ]

    for (const shape of shapes) expect(overshoots(smoothPath(at(shape))), JSON.stringify(shape)).toBe(false)
  })

  it("keeps a flat run flat, so a steady metric draws as a straight line", () => {
    for (const cubic of cubics(smoothPath(at([7, 7, 7, 7])))) {
      expect(cubic.c1).toBeCloseTo(7, 6)
      expect(cubic.c2).toBeCloseTo(7, 6)
    }
  })

  it("flattens at a local peak instead of rounding past it", () => {
    // The tangent at the summit is zero, so both controls either side sit at its height.
    const summit = cubics(smoothPath(at([2, 9, 2])))

    expect(summit[0]?.c2).toBeCloseTo(9, 6)
    expect(summit[1]?.c1).toBeCloseTo(9, 6)
  })

  it("keeps an isolated point rather than dropping the run it is alone in", () => {
    // `[1, null, 2]` has two known values but no two adjacent, so every run holds one
    // point. Discarding short runs rendered a blank chart for a series that has data.
    expect(smoothPath(at([5]))).toBe("M0.00,5.00")
  })

  it("degrades safely on a single point or none", () => {
    expect(smoothPath([])).toBe("")
    expect(smoothPath(at([3]))).toBe("M0.00,3.00")
  })
})
