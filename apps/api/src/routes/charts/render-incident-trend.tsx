import type { IncidentBreach, IncidentTrend } from "@domain/notifications"
import { Resvg } from "@resvg/resvg-js"
// @ts-expect-error TS6133 - React required at runtime for JSX
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX
import React from "react"
import satori from "satori"
import { getChartFont } from "./fonts.ts"

const CHART_WIDTH = 600
const CHART_HEIGHT = 200
const PADDING_X = 16
const PADDING_TOP = 14
const PADDING_BOTTOM = 22

const COLORS = {
  background: "#ffffff",
  bar: "#dbe5ff",
  barEmphasis: "#3b5bff",
  threshold: "#dc2626",
  baseline: "#9ca3af",
  axis: "#e5e7eb",
  label: "#6b7280",
} as const

/**
 * Server-side renderer for the email's incident trend chart. Bars are
 * the per-bucket occurrence counts; a dashed red threshold line traces
 * the seasonal entry band per-bucket (broken across `null` thresholds
 * the same way the bell sparkline / `IssueTrendBar` does). Optional
 * baseline reference line for sustained-opened renders.
 *
 * 600×200 px PNG, no axis ticks — meant for an at-a-glance email read.
 */
export const renderIncidentTrendPng = async (input: {
  readonly trend: IncidentTrend
  readonly breach?: IncidentBreach
}): Promise<Buffer> => {
  const font = await getChartFont()
  const points = input.trend.points
  if (points.length === 0) {
    // Render an empty chart frame so the email still has something
    // visually anchored where the chart would be.
    return renderEmpty(font)
  }

  // Scale: bars + threshold both participate. Floor at 1 so a flat-zero
  // window doesn't blow up to NaN.
  const maxCount = Math.max(1, ...points.map((p) => Math.max(p.count, p.threshold !== null ? p.threshold : 0)))

  const innerWidth = CHART_WIDTH - PADDING_X * 2
  const innerHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM
  const barSlot = innerWidth / points.length
  const barWidth = Math.max(2, barSlot * 0.7)
  const barGap = barSlot - barWidth

  const yForValue = (value: number) => PADDING_TOP + (1 - value / maxCount) * innerHeight

  const peakCount = points.reduce((m, p) => (p.count > m ? p.count : m), 0)
  // Group consecutive points with non-null thresholds. Each segment
  // becomes one dashed run.
  const segments: { start: number; end: number; values: number[] }[] = []
  let activeStart: number | null = null
  let activeValues: number[] = []
  points.forEach((p, idx) => {
    if (p.threshold !== null) {
      if (activeStart === null) {
        activeStart = idx
        activeValues = []
      }
      activeValues.push(p.threshold)
    } else if (activeStart !== null) {
      segments.push({ start: activeStart, end: activeStart + activeValues.length - 1, values: activeValues })
      activeStart = null
      activeValues = []
    }
  })
  if (activeStart !== null) {
    segments.push({ start: activeStart, end: activeStart + activeValues.length - 1, values: activeValues })
  }

  const baselineY = input.breach ? yForValue(input.breach.baselineRate) : null
  const showBaseline = baselineY !== null && baselineY > PADDING_TOP && baselineY < CHART_HEIGHT - PADDING_BOTTOM

  const svg = await satori(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: COLORS.background,
        fontFamily: "Source Serif Pro",
        position: "relative",
      }}
    >
      {/* Chart frame */}
      <div
        style={{
          position: "absolute",
          left: PADDING_X,
          right: PADDING_X,
          top: PADDING_TOP,
          bottom: PADDING_BOTTOM,
          display: "flex",
          alignItems: "flex-end",
          gap: `${barGap}px`,
        }}
      >
        {points.map((p, idx) => {
          const heightPx = (p.count / maxCount) * innerHeight
          const isPeak = p.count === peakCount && peakCount > 0
          return (
            <div
              key={`${p.t}-${idx}`}
              style={{
                width: `${barWidth}px`,
                height: `${Math.max(heightPx, 1)}px`,
                backgroundColor: isPeak ? COLORS.barEmphasis : COLORS.bar,
                borderRadius: "2px",
                display: "flex",
              }}
            />
          )
        })}
      </div>
      {/* Baseline reference line */}
      {showBaseline ? (
        <div
          style={{
            position: "absolute",
            left: PADDING_X,
            right: PADDING_X,
            top: baselineY - 0.5,
            height: "1px",
            backgroundColor: COLORS.baseline,
            display: "flex",
          }}
        />
      ) : null}
      {/* Threshold segments — render each contiguous run as a dashed line built from short bars */}
      {segments.map((segment) => (
        <ThresholdSegment
          key={`${segment.start}-${segment.end}`}
          segment={segment}
          barSlot={barSlot}
          paddingX={PADDING_X}
          yForValue={yForValue}
        />
      ))}
      {/* Caption: peak count + breach context when available */}
      <div
        style={{
          position: "absolute",
          left: PADDING_X,
          right: PADDING_X,
          bottom: 4,
          display: "flex",
          justifyContent: "space-between",
          color: COLORS.label,
          fontSize: 11,
        }}
      >
        <span>peak {peakCount}/bucket</span>
        {input.breach ? (
          <span>
            baseline {Math.round(input.breach.baselineRate)}/hr · threshold {Math.round(input.breach.threshold)}/hr
          </span>
        ) : (
          <span />
        )}
      </div>
    </div>,
    {
      width: CHART_WIDTH,
      height: CHART_HEIGHT,
      fonts: [{ name: "Source Serif Pro", data: font, weight: 400, style: "normal" }],
    },
  )

  return new Resvg(svg, { fitTo: { mode: "width", value: CHART_WIDTH } }).render().asPng()
}

/**
 * Per-segment dashed line drawn as a row of short filled rects. Satori
 * doesn't render SVG `stroke-dasharray`, and CSS `border-style: dashed`
 * inside satori produces inconsistent results across renders, so the
 * dashes are emitted as positioned divs.
 */
function ThresholdSegment({
  segment,
  barSlot,
  paddingX,
  yForValue,
}: {
  readonly segment: { start: number; end: number; values: number[] }
  readonly barSlot: number
  readonly paddingX: number
  readonly yForValue: (value: number) => number
}) {
  const dashEvery = 8
  const dashLen = 4
  const startX = paddingX + segment.start * barSlot + barSlot / 2
  const endX = paddingX + segment.end * barSlot + barSlot / 2
  const widthPx = Math.max(2, endX - startX)
  // Average the threshold within the segment for the y position. Most
  // segments are flat in practice (the seasonal grid changes hourly).
  const avgThreshold = segment.values.reduce((s, v) => s + v, 0) / segment.values.length
  const y = yForValue(avgThreshold)
  const dashCount = Math.max(1, Math.floor(widthPx / dashEvery))
  return (
    <div
      style={{
        position: "absolute",
        left: startX,
        top: y - 0.75,
        width: widthPx,
        height: 1.5,
        display: "flex",
        gap: `${dashEvery - dashLen}px`,
      }}
    >
      {Array.from({ length: dashCount }).map((_, i) => (
        <div
          key={i}
          style={{
            width: `${dashLen}px`,
            height: "1.5px",
            backgroundColor: COLORS.threshold,
            display: "flex",
          }}
        />
      ))}
    </div>
  )
}

const renderEmpty = async (font: ArrayBuffer): Promise<Buffer> => {
  const svg = await satori(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.background,
        color: COLORS.label,
        fontFamily: "Source Serif Pro",
        fontSize: 13,
      }}
    >
      No trend data
    </div>,
    {
      width: CHART_WIDTH,
      height: CHART_HEIGHT,
      fonts: [{ name: "Source Serif Pro", data: font, weight: 400, style: "normal" }],
    },
  )
  return new Resvg(svg, { fitTo: { mode: "width", value: CHART_WIDTH } }).render().asPng()
}

/**
 * 1×1 transparent PNG used as the fallback when the request hits a
 * notification row that doesn't have a trend (e.g. `incident.event`)
 * or the row was deleted. Returning a real PNG keeps the email's
 * `<Img>` tag from breaking into an alt-text fallback.
 */
export const TRANSPARENT_1x1_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==",
  "base64",
)
