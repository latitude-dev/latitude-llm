import type { PercentileTraceFilterField } from "@domain/shared"
import { Button, Text, useMountEffect } from "@repo/ui"
import { formatCount, formatDuration, formatPrice } from "@repo/utils"
import { XIcon } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import { useTraceDistribution } from "../../domains/traces/traces.collection.ts"

interface PercentileFilterProps {
  readonly projectId: string
  readonly field: PercentileTraceFilterField
  /** Locked percentile threshold (0–100), or undefined when no filter is set. */
  readonly value: number | undefined
  readonly onChange: (percentile: number | undefined) => void
}

const CHART_HEIGHT = 64
const VIEW_WIDTH = 200
const SMOOTH_WINDOW = 4

/**
 * Build chart data from percentile values.
 *
 * X-axis is percentile (0..100), Y-axis is local density in percentile space —
 * `1 / (pv[i+1] - pv[i])` — which means tightly-packed value ranges show as
 * tall bars (high density) and sparse tails as short bars. The result reads
 * like a smoothed PDF on a percentile axis: trivial cursor-to-percentile
 * mapping, but still bell-curve-shaped for typical distributions.
 *
 * Returns 100 normalized y-coordinates in [0, 1] (1 = peak density).
 */
function computeNormalizedDensity(percentileValues: readonly number[]): readonly number[] {
  if (percentileValues.length < 2) return []

  const range = percentileValues[100]! - percentileValues[0]!
  // Floor each spacing at 0.1% of the full range. This trades fidelity at
  // ultra-dense points for a finite y so equal-value spikes don't blow up
  // the chart.
  const minSpacing = range > 0 ? range / 1000 : 1

  const raw: number[] = new Array(100)
  for (let i = 0; i < 100; i++) {
    const spacing = Math.max(percentileValues[i + 1]! - percentileValues[i]!, minSpacing)
    raw[i] = 1 / spacing
  }

  // Symmetric moving average — softens spikes from quantile interpolation noise.
  const smoothed: number[] = new Array(100)
  for (let i = 0; i < 100; i++) {
    let sum = 0
    let count = 0
    for (let j = Math.max(0, i - SMOOTH_WINDOW); j <= Math.min(99, i + SMOOTH_WINDOW); j++) {
      sum += raw[j]!
      count++
    }
    smoothed[i] = sum / count
  }

  const peak = Math.max(...smoothed)
  if (peak <= 0) return new Array(100).fill(0)
  return smoothed.map((d) => d / peak)
}

function densityPoints(densities: readonly number[]): readonly { x: number; y: number }[] {
  if (densities.length === 0) return []
  const stepX = VIEW_WIDTH / (densities.length - 1)
  // Reserve a 2px top margin so the peak line never touches the edge.
  return densities.map((d, i) => ({ x: i * stepX, y: CHART_HEIGHT - d * (CHART_HEIGHT - 2) }))
}

/** Open path tracing only the top of the curve — used as the outline stroke. */
function buildCurvePath(points: readonly { x: number; y: number }[]): string {
  if (points.length === 0) return ""
  const [first, ...rest] = points
  const head = `M ${first!.x.toFixed(2)} ${first!.y.toFixed(2)}`
  const tail = rest.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ")
  return tail ? `${head} ${tail}` : head
}

/** Closed path under the curve down to the baseline — used for fills. */
function buildAreaPath(points: readonly { x: number; y: number }[]): string {
  if (points.length === 0) return ""
  const head = `M ${points[0]!.x.toFixed(2)} ${CHART_HEIGHT}`
  const curve = points.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ")
  const last = points[points.length - 1]!
  return `${head} ${curve} L ${last.x.toFixed(2)} ${CHART_HEIGHT} Z`
}

function formatValueForField(field: PercentileTraceFilterField, value: number): string {
  if (field === "duration" || field === "ttft") return formatDuration(value)
  if (field === "cost") return formatPrice(value / 100_000_000)
  return String(value)
}

export function PercentileFilter({ projectId, field, value, onChange }: PercentileFilterProps) {
  const { data: distribution, isLoading, isError } = useTraceDistribution({ projectId, field })
  const [hoverPercentile, setHoverPercentile] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // SSR-safe hydration: avoid drawing the chart until mounted because the SVG
  // dimensions depend on layout. Without this, the first render flickers.
  const [mounted, setMounted] = useState(false)
  useMountEffect(() => {
    setMounted(true)
  })

  const percentileValues = distribution?.percentileValues ?? []
  const totalCount = distribution?.count ?? 0

  const densities = useMemo(() => computeNormalizedDensity(percentileValues), [percentileValues])
  const points = useMemo(() => densityPoints(densities), [densities])
  const curvePath = useMemo(() => buildCurvePath(points), [points])
  const areaPath = useMemo(() => buildAreaPath(points), [points])

  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const ratio = (e.clientX - rect.left) / rect.width
    const clamped = Math.max(0, Math.min(99, ratio * 100))
    setHoverPercentile(Math.round(clamped))
  }, [])

  const handleLeave = useCallback(() => setHoverPercentile(null), [])

  const handleClick = useCallback(() => {
    if (hoverPercentile === null) return
    onChange(hoverPercentile)
  }, [hoverPercentile, onChange])

  const handleClear = useCallback(() => {
    onChange(undefined)
    setHoverPercentile(null)
  }, [onChange])

  // Keyboard parity for the click interaction: arrow keys nudge the threshold,
  // PageUp/Down step by 10, Home/End jump to the extremes, Backspace clears.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const current = value ?? 50
      let next: number | undefined
      switch (e.key) {
        case "ArrowLeft":
        case "ArrowDown":
          next = Math.max(0, current - 1)
          break
        case "ArrowRight":
        case "ArrowUp":
          next = Math.min(99, current + 1)
          break
        case "PageDown":
          next = Math.max(0, current - 10)
          break
        case "PageUp":
          next = Math.min(99, current + 10)
          break
        case "Home":
          next = 0
          break
        case "End":
          next = 99
          break
        case "Backspace":
        case "Delete":
          if (value !== undefined) {
            e.preventDefault()
            onChange(undefined)
          }
          return
        default:
          return
      }
      e.preventDefault()
      onChange(next)
    },
    [value, onChange],
  )

  const hasData = totalCount > 0 && densities.length > 0
  const lockedPercentile = value !== undefined ? Math.max(0, Math.min(100, Math.round(value))) : null

  // Active marker = hovered position when present, else the locked one.
  const activePercentile = hoverPercentile ?? lockedPercentile
  const activeIsHover = hoverPercentile !== null
  const activeValue = activePercentile !== null ? percentileValues[activePercentile] : undefined

  // Approximate trace count at-or-above the active percentile.
  const tracesAtOrAbove =
    activePercentile !== null && totalCount > 0
      ? Math.max(0, Math.round(((100 - activePercentile) / 100) * totalCount))
      : null

  if (isLoading || !mounted) {
    return (
      <div className="flex flex-col gap-1">
        <div className="w-full animate-pulse rounded-lg bg-muted" style={{ height: CHART_HEIGHT }} />
        <span className="pl-0.5">
          <Text.H7 color="foregroundMuted">Loading distribution…</Text.H7>
        </span>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-1">
        <div
          className="flex w-full items-center justify-center rounded-lg border border-dashed border-border"
          style={{ height: CHART_HEIGHT }}
        >
          <span className="pl-0.5">
            <Text.H7 color="destructive">Could not load distribution</Text.H7>
          </span>
        </div>
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="flex flex-col gap-1">
        <div
          className="flex w-full items-center justify-center rounded-lg border border-dashed border-border"
          style={{ height: CHART_HEIGHT }}
        >
          <span className="pl-0.5">
            <Text.H7 color="foregroundMuted">No data</Text.H7>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={containerRef}
        role="slider"
        aria-label={`${field} percentile threshold`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={lockedPercentile ?? 0}
        tabIndex={0}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="relative w-full cursor-crosshair select-none overflow-hidden"
        style={{ height: CHART_HEIGHT }}
      >
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={`pct-clip-locked-${field}`}>
              {lockedPercentile !== null && (
                <rect
                  x={(lockedPercentile / 100) * VIEW_WIDTH}
                  y={0}
                  width={VIEW_WIDTH - (lockedPercentile / 100) * VIEW_WIDTH}
                  height={CHART_HEIGHT}
                />
              )}
            </clipPath>
            <clipPath id={`pct-clip-hover-${field}`}>
              {hoverPercentile !== null && (
                <rect
                  x={(hoverPercentile / 100) * VIEW_WIDTH}
                  y={0}
                  width={VIEW_WIDTH - (hoverPercentile / 100) * VIEW_WIDTH}
                  height={CHART_HEIGHT}
                />
              )}
            </clipPath>
          </defs>

          {/* Outline of the full distribution — only the top of the curve, no baseline/side closure. */}
          <path
            d={curvePath}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={1}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Locked fill: solid primary on the right of the locked threshold. */}
          {lockedPercentile !== null && (
            <>
              <path
                d={areaPath}
                fill="hsl(var(--primary) / 0.45)"
                stroke="none"
                clipPath={`url(#pct-clip-locked-${field})`}
              />
              <path
                d={curvePath}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={1}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                clipPath={`url(#pct-clip-locked-${field})`}
              />
            </>
          )}

          {/* Hover preview: muted primary fill on the right of the cursor. */}
          {hoverPercentile !== null && (
            <path
              d={areaPath}
              fill="hsl(var(--primary) / 0.2)"
              stroke="none"
              clipPath={`url(#pct-clip-hover-${field})`}
            />
          )}
        </svg>

        {/* Locked solid vertical line. Top inset matches the 2px curve reservation
            so the line never extends above the chart's peak. */}
        {lockedPercentile !== null && (
          <div
            className="pointer-events-none absolute top-0.5 bottom-0 w-px bg-primary"
            style={{ left: `${lockedPercentile}%` }}
          />
        )}

        {/* Hover dashed vertical line — drawn on top of locked. */}
        {hoverPercentile !== null && (
          <div
            className="pointer-events-none absolute top-0.5 bottom-0 w-px"
            style={{
              left: `${hoverPercentile}%`,
              backgroundImage: "linear-gradient(to bottom, hsl(var(--primary)) 50%, transparent 50%)",
              backgroundSize: "1px 4px",
            }}
          />
        )}
      </div>

      <div className="flex items-center justify-between pl-px w-full">
        <div className="flex flex-col items-start justify-center">
          <div className="inline-flex w-full">
            {activePercentile !== null ? (
              <Text.H7 color={activeIsHover && lockedPercentile === null ? "foregroundMuted" : "foreground"}>
                {`≥ p${activePercentile}`}
                {activeValue !== undefined && totalCount > 0 ? ` · ${formatValueForField(field, activeValue)}` : null}
                {tracesAtOrAbove !== null ? ` · ~${formatCount(tracesAtOrAbove)} traces` : null}
              </Text.H7>
            ) : (
              <Text.H7 color="foregroundMuted">Click chart to set a percentile threshold</Text.H7>
            )}
          </div>

          <PercentileQuickPicks active={lockedPercentile} onPick={onChange} />
        </div>

        {lockedPercentile !== null && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClear}
            className="h-6 w-6 shrink-0"
            aria-label="Clear percentile filter"
            title="Clear percentile filter"
          >
            <XIcon className="h-3.5 w-3.5 shrink-0" />
          </Button>
        )}
      </div>
    </div>
  )
}

const QUICK_PICK_PERCENTILES = [50, 90, 95, 99] as const

function PercentileQuickPicks({
  active,
  onPick,
}: {
  readonly active: number | null
  readonly onPick: (percentile: number) => void
}) {
  return (
    <div className="inline-flex items-center gap-1 w-full">
      {QUICK_PICK_PERCENTILES.map((p, i) => (
        <span key={p} className="inline-flex items-center gap-1">
          {i > 0 && (
            <Text.H7 color="foregroundMuted" noWrap>
              ·
            </Text.H7>
          )}
          <button
            type="button"
            onClick={() => onPick(p)}
            className="inline-flex p-0 cursor-pointer underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            <Text.H7
              color={active === p ? "primary" : "foregroundMuted"}
              weight={active === p ? "semibold" : "normal"}
            >{`p${p}`}</Text.H7>
          </button>
        </span>
      ))}
    </div>
  )
}
