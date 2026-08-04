const VIEWBOX_WIDTH = 100
const VIEWBOX_HEIGHT = 28
const STROKE_WIDTH = 1.6

// An all-zero series has no shape to draw, and dividing by its range would put the
// line at an arbitrary height.
const EMPTY_RANGE_EPSILON = 1e-9

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

  // One `path` per run of known values, so a gap renders as a gap.
  const segments: string[] = []
  let current: string[] = []
  points.forEach((point, index) => {
    if (point === null) {
      if (current.length > 1) segments.push(current.join(" "))
      current = []
      return
    }
    current.push(`${current.length === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(point).toFixed(2)}`)
  })
  if (current.length > 1) segments.push(current.join(" "))

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
      {segments.map((segment) => (
        <path
          key={segment}
          d={segment}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}
