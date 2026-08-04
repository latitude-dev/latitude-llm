const VIEWBOX_WIDTH = 100
const VIEWBOX_HEIGHT = 28
const STROKE_WIDTH = 1.6

// An all-zero series has no shape to draw, and dividing by its range would put the
// line at an arbitrary height.
const EMPTY_RANGE_EPSILON = 1e-9

export interface SparklinePoint {
  readonly x: number
  readonly y: number
}

/**
 * Tangents for a monotone cubic through the points (Fritsch–Carlson).
 *
 * Monotone rather than a cardinal spline or Catmull-Rom, because those overshoot:
 * a run at 10 with a single 16 in it would bulge above 16 on the way in and dip
 * below 10 on the way out, drawing values the data never held. On a zero-baselined
 * chart the dips can also cross the floor. The constraint step here bounds every
 * segment by its own two endpoints, so the curve can only smooth the corners.
 */
function monotoneTangents(points: readonly SparklinePoint[]): number[] {
  const secants: number[] = []
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index]
    const to = points[index + 1]
    if (!from || !to) continue
    secants.push((to.y - from.y) / (to.x - from.x))
  }

  const tangents = points.map((_, index) => {
    if (index === 0) return secants[0] ?? 0
    if (index === points.length - 1) return secants[secants.length - 1] ?? 0
    const before = secants[index - 1] ?? 0
    const after = secants[index] ?? 0
    // A local extreme has to flatten, or the curve rounds straight past it.
    return before * after <= 0 ? 0 : (before + after) / 2
  })

  for (let index = 0; index < secants.length; index++) {
    const secant = secants[index] ?? 0
    if (secant === 0) {
      tangents[index] = 0
      tangents[index + 1] = 0
      continue
    }
    const alpha = (tangents[index] ?? 0) / secant
    const beta = (tangents[index + 1] ?? 0) / secant
    const magnitude = alpha * alpha + beta * beta
    if (magnitude <= 9) continue
    const scale = 3 / Math.sqrt(magnitude)
    tangents[index] = scale * alpha * secant
    tangents[index + 1] = scale * beta * secant
  }

  return tangents
}

export const smoothPath = (points: readonly SparklinePoint[]): string => {
  const first = points[0]
  if (!first) return ""
  if (points.length === 1) return `M${first.x.toFixed(2)},${first.y.toFixed(2)}`

  const tangents = monotoneTangents(points)
  let path = `M${first.x.toFixed(2)},${first.y.toFixed(2)}`
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index]
    const to = points[index + 1]
    if (!from || !to) continue
    const run = (to.x - from.x) / 3
    const c1y = from.y + (tangents[index] ?? 0) * run
    const c2y = to.y - (tangents[index + 1] ?? 0) * run
    path += ` C${(from.x + run).toFixed(2)},${c1y.toFixed(2)} ${(to.x - run).toFixed(2)},${c2y.toFixed(2)} ${to.x.toFixed(2)},${to.y.toFixed(2)}`
  }
  return path
}

/**
 * Shape of a headline measure over the two compared windows, drawn from the same
 * buckets the decomposition was computed on.
 *
 * Zero-baselined, never scaled to the series' own minimum. Normalising to min..max
 * makes any variation fill the full height however small it is in absolute terms:
 * sessions sitting at 10 with the odd 4 and 16 drew as full-height cliffs off a
 * mid-line, which reads as a crisis rather than as a steady 10. Anchoring at zero
 * also makes the two sparklines on the card comparable to each other, which two
 * independently self-scaling ones never are.
 *
 * Gaps are breaks in the line, not zeroes: a bucket with no sessions has no cost
 * per session, and joining across it would invent a value. Otherwise axis-free and
 * label-free — it carries shape, and the figure above it carries the magnitude.
 */
export function SessionSparkline({
  points,
  label,
  boundaryIndex,
}: {
  readonly points: readonly (number | null)[]
  readonly label: string
  /** First index of the current window, marked so the comparison is visible. */
  readonly boundaryIndex?: number | undefined
}) {
  const known = points.filter((point): point is number => point !== null)
  if (known.length < 2) return <div className="h-7" aria-hidden />

  const max = Math.max(...known, 0)
  if (max <= EMPTY_RANGE_EPSILON) return <div className="h-7" aria-hidden />

  const x = (index: number) => (points.length === 1 ? 0 : (index / (points.length - 1)) * VIEWBOX_WIDTH)
  const y = (value: number) =>
    VIEWBOX_HEIGHT - STROKE_WIDTH - (Math.max(0, value) / max) * (VIEWBOX_HEIGHT - STROKE_WIDTH * 2)

  // One run per stretch of known values, so a gap renders as a gap. A run of one has
  // no line to draw and becomes a dot: dropping it renders a blank chart for a series
  // whose known values are all isolated, such as `[1, null, 2]`.
  const runs: SparklinePoint[][] = []
  let current: SparklinePoint[] = []
  points.forEach((point, index) => {
    if (point === null) {
      if (current.length > 0) runs.push(current)
      current = []
      return
    }
    current.push({ x: x(index), y: y(point) })
  })
  if (current.length > 0) runs.push(current)

  const boundary =
    boundaryIndex !== undefined && boundaryIndex > 0 && boundaryIndex < points.length ? x(boundaryIndex) : null

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      className="h-7 w-full text-muted-foreground"
      role="img"
      aria-label={label}
    >
      {boundary === null ? null : (
        <line
          x1={boundary}
          x2={boundary}
          y1={0}
          y2={VIEWBOX_HEIGHT}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="2 2"
          className="text-border"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {runs.map((run) => {
        const only = run.length === 1 ? run[0] : undefined
        if (only) {
          return <circle key={`${only.x},${only.y}`} cx={only.x} cy={only.y} r={STROKE_WIDTH} fill="currentColor" />
        }
        const path = smoothPath(run)
        return (
          <path
            key={path}
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </svg>
  )
}
