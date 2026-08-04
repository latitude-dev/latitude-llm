const VIEWBOX_WIDTH = 100
const VIEWBOX_HEIGHT = 28
const STROKE_WIDTH = 1.6

// A flat series would sit on the floor of its own range; centre it instead so a
// steady metric reads as steady rather than as zero.
const FLAT_RANGE_EPSILON = 1e-9

/**
 * Shape of a headline measure over the two compared windows, drawn from the same
 * buckets the decomposition was computed on.
 *
 * Gaps are breaks in the line, not zeroes: a bucket with no sessions has no cost
 * per session, and joining across it would invent a value. Deliberately axis-free
 * and label-free — it carries shape only, and the figure above it carries the
 * magnitude.
 */
export function SessionSparkline({
  points,
  label,
}: {
  readonly points: readonly (number | null)[]
  readonly label: string
}) {
  const known = points.filter((point): point is number => point !== null)
  if (known.length < 2) return <div className="h-7" aria-hidden />

  const min = Math.min(...known)
  const max = Math.max(...known)
  const span = max - min
  const x = (index: number) => (points.length === 1 ? 0 : (index / (points.length - 1)) * VIEWBOX_WIDTH)
  const y = (value: number) =>
    span <= FLAT_RANGE_EPSILON
      ? VIEWBOX_HEIGHT / 2
      : VIEWBOX_HEIGHT - STROKE_WIDTH - ((value - min) / span) * (VIEWBOX_HEIGHT - STROKE_WIDTH * 2)

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

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      className="h-7 w-full text-muted-foreground"
      role="img"
      aria-label={label}
    >
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
