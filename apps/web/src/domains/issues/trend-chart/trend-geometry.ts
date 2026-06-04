/**
 * Pure geometry helpers for the issue occurrence-trend chart, shared between the live
 * in-app drawer chart (`IssueTrendBar`) and the server-side incident-trend PNG renderer
 * (`render-incident-trend.tsx`) so both produce the same bar heights and the same
 * seasonal-expectation dashed curve.
 *
 * Everything here is framework-agnostic (no React, no SVG strings) — just the math that maps
 * `{ count, threshold }` series into a `0..100` vertical space and a smooth path.
 */

/** Floor so a non-zero bucket always shows at least a sliver. */
export const MIN_VISIBLE_BAR_HEIGHT_PERCENT = 12
/** Ceiling so the tallest bar / threshold never touches the top edge. */
export const MAX_VISIBLE_BAR_HEIGHT_PERCENT = 88

/** One bucket of the trend: its occurrence count and the seasonal threshold (`null` = no history). */
export interface TrendGeometryPoint {
  readonly count: number
  readonly threshold: number | null
}

/** A point in the `0..N` (x, bucket index) × `0..100` (y) chart space used by the threshold path. */
export interface ThresholdPoint {
  readonly x: number
  readonly y: number
}

/**
 * Map a count to a visible height percentage in `[0, MAX]`. Zero stays zero (no bar); anything
 * positive is clamped up to `MIN` so it stays legible.
 */
export function toVisibleHeightPercent(count: number, maxCount: number): number {
  if (count === 0) {
    return 0
  }
  return Math.max(MIN_VISIBLE_BAR_HEIGHT_PERCENT, (count / maxCount) * MAX_VISIBLE_BAR_HEIGHT_PERCENT)
}

/**
 * The scale denominator: the largest of all counts AND thresholds (so the dashed line never
 * clips off the top), floored at 1 so a flat-zero window doesn't divide by zero.
 */
export function computeTrendMaxCount(points: readonly TrendGeometryPoint[]): number {
  return Math.max(...points.map((point) => Math.max(point.count, point.threshold ?? 0)), 1)
}

/**
 * Group consecutive buckets that carry a threshold into smoothable segments. A `null` threshold
 * breaks the line — that span had no contributing prior history, so any "expected" value would be
 * misleading. Coordinates use the chart-wide space: `x = bucket center (i + 0.5)` in `0..N`,
 * `y = 100 − heightPercent` in `0..100`.
 */
export function buildThresholdSegments(points: readonly TrendGeometryPoint[], maxCount: number): ThresholdPoint[][] {
  const segments: ThresholdPoint[][] = []
  let active: ThresholdPoint[] = []
  points.forEach((point, index) => {
    if (point.threshold === null) {
      if (active.length > 0) {
        segments.push(active)
        active = []
      }
      return
    }
    const heightPercent = toVisibleHeightPercent(point.threshold, maxCount)
    active.push({ x: index + 0.5, y: 100 - heightPercent })
  })
  if (active.length > 0) segments.push(active)
  return segments
}

/**
 * Build a single SVG `<path>` `d` attribute that smoothly connects the given points using a
 * Catmull-Rom spline expressed as cubic Bezier segments. Endpoints duplicate themselves as
 * virtual neighbours so the curve doesn't accelerate at the boundary. Coordinates are emitted
 * with 3 decimals — enough for sub-pixel placement when the SVG scales to its container.
 */
export function buildSmoothThresholdPath(points: readonly ThresholdPoint[]): string {
  if (points.length === 0) return ""
  const first = points[0]
  if (!first) return ""
  if (points.length === 1) {
    // Single point inside an otherwise-broken segment: draw a tiny horizontal dash so the
    // datum is still visible (otherwise an isolated bucket would render as nothing).
    return `M ${(first.x - 0.3).toFixed(3)} ${first.y.toFixed(3)} L ${(first.x + 0.3).toFixed(3)} ${first.y.toFixed(3)}`
  }

  const parts: string[] = [`M ${first.x.toFixed(3)} ${first.y.toFixed(3)}`]
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]
    const p2 = points[i + 1]
    if (!p1 || !p2) continue
    const p0 = points[i - 1] ?? p1
    const p3 = points[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    parts.push(
      `C ${cp1x.toFixed(3)} ${cp1y.toFixed(3)}, ${cp2x.toFixed(3)} ${cp2y.toFixed(3)}, ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`,
    )
  }
  return parts.join(" ")
}
