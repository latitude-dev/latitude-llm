import type { IncidentTrend } from "@domain/notifications"
import { Resvg } from "@resvg/resvg-js"
import { INCIDENT_SEVERITY_HEX } from "../../alerts/incident-markers.ts"
import {
  buildSmoothThresholdPath,
  buildThresholdSegments,
  computeTrendMaxCount,
  type ThresholdPoint,
  toVisibleHeightPercent,
} from "../../issues/trend-chart/trend-geometry.ts"
import { getChartFontFile } from "./fonts.ts"

/**
 * Server-side renderer for the incident-trend chart embedded in the escalating-incident Slack
 * message and email. It mirrors the in-app issue-detail drawer chart (`IssueTrendBar`) — same
 * 14-day / 12h window, same gray occurrence bars, the same smooth dashed seasonal-expectation
 * curve, and a severity band + start dot for the triggering incident — so the notification and
 * the issue page read as the same chart.
 *
 * Built as a hand-authored SVG string rasterised by Resvg (not Satori): Satori can't render SVG
 * `stroke-dasharray`, which the expectation curve needs. Resvg/usvg renders `<path>` dashes,
 * `<rect>`, `<circle>`, `<line>`, and `<text>` faithfully; the geometry/segmentation math is the
 * exact same pure helpers the drawer uses, so the two stay visually in sync.
 *
 * 600×200 px PNG (matches the email `<Img>` aspect ratio), light theme only.
 */

const WIDTH = 600
const HEIGHT = 200
const PADDING_X = 16
const CHART_TOP = 12
const CHART_BOTTOM = 28 // room for the day-axis labels

const CHART_LEFT = PADDING_X
const CHART_RIGHT = WIDTH - PADDING_X
const CHART_TOP_Y = CHART_TOP
const CHART_BOTTOM_Y = HEIGHT - CHART_BOTTOM
const INNER_W = CHART_RIGHT - CHART_LEFT
const INNER_H = CHART_BOTTOM_Y - CHART_TOP_Y

const GUIDE_LINE_COUNT = 5
const MAX_AXIS_LABELS = 6

/** Light-theme palette mapping the drawer's Tailwind tokens to concrete colors usvg can parse. */
const COLORS = {
  background: "#ffffff",
  bar: "#66727f", // muted-foreground
  guide: "#e5e5e5", // border
  threshold: "#66727f", // muted-foreground (dashed expectation curve)
  label: "#66727f", // muted-foreground
} as const
const BAR_OPACITY = 0.6
const GUIDE_OPACITY = 0.6
const THRESHOLD_OPACITY = 0.6
const SEVERITY_BAND_OPACITY = 0.16

const fmt = (value: number): string => value.toFixed(2)

const escapeXml = (value: string): string =>
  value.replace(/[<>&'"]/g, (char) =>
    char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === "&" ? "&amp;" : char === "'" ? "&apos;" : "&quot;",
  )

const formatDayLabel = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  // UTC so the label matches the bucket's UTC-aligned start regardless of server timezone.
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

/**
 * Same even-spread label selection the drawer uses (`getVisibleBucketLabelIndices`): show every
 * bucket up to the cap, otherwise pick `MAX_AXIS_LABELS` evenly-spaced indices including both ends.
 */
const pickLabelIndices = (total: number): ReadonlySet<number> => {
  if (total <= 0) return new Set()
  if (total <= MAX_AXIS_LABELS) return new Set(Array.from({ length: total }, (_, index) => index))
  const count = Math.max(2, MAX_AXIS_LABELS)
  return new Set(Array.from({ length: count }, (_, index) => Math.round((index * (total - 1)) / (count - 1))))
}

/** Snap a timestamp to the bucket index whose `[start, start + width)` range contains it. */
const snapToBucketIndex = (ms: number, firstStartMs: number, widthMs: number, lastIndex: number): number | null => {
  if (!Number.isFinite(ms) || widthMs <= 0) return null
  const index = Math.floor((ms - firstStartMs) / widthMs)
  if (index < 0 || index > lastIndex) return null
  return index
}

interface IncidentSpan {
  /** Bucket the band starts at (clamped to 0 when the incident opened before the window). */
  readonly bandStart: number
  /** Bucket the band ends at (clamped to the last bucket while the incident is still open). */
  readonly bandEnd: number
  /** Bucket the start dot sits in, or `null` when the incident opened outside the window. */
  readonly dotBucket: number | null
  readonly color: string
}

/** Resolve the severity band span + start-dot bucket from the trend's incident marker. */
const resolveIncidentSpan = (trend: IncidentTrend, bucketStartsMs: readonly number[]): IncidentSpan | null => {
  const marker = trend.marker
  const firstStartMs = bucketStartsMs[0]
  if (!marker || firstStartMs === undefined || !Number.isFinite(firstStartMs)) return null

  const widthMs = trend.bucketDurationMs
  const lastIndex = bucketStartsMs.length - 1
  const startedMs = Date.parse(marker.startedAt)
  const endedMs = marker.endedAt !== null ? Date.parse(marker.endedAt) : Number.NaN

  const dotBucket = snapToBucketIndex(startedMs, firstStartMs, widthMs, lastIndex)
  // Band start: snapped bucket, or 0 when the incident opened before the window but is active in it.
  const bandStart = dotBucket ?? (Number.isFinite(startedMs) && startedMs < firstStartMs ? 0 : null)
  if (bandStart === null) return null

  let bandEnd: number
  if (marker.endedAt !== null) {
    const snapped = snapToBucketIndex(endedMs, firstStartMs, widthMs, lastIndex)
    bandEnd = snapped ?? (Number.isFinite(endedMs) && endedMs >= firstStartMs ? lastIndex : bandStart)
  } else {
    // Still open → paint to the right edge, matching the drawer's ongoing-range behaviour.
    bandEnd = lastIndex
  }

  return { bandStart, bandEnd, dotBucket, color: INCIDENT_SEVERITY_HEX[marker.severity] }
}

/** Map a threshold point from the drawer's `0..N × 0..100` space into this chart's pixel space. */
const toPixel = (point: ThresholdPoint, barSlot: number): ThresholdPoint => ({
  x: CHART_LEFT + point.x * barSlot,
  y: CHART_TOP_Y + (point.y / 100) * INNER_H,
})

const renderToPng = (svg: string, fontFile: string): Buffer =>
  new Resvg(svg, {
    fitTo: { mode: "width", value: WIDTH },
    font: { fontFiles: [fontFile], defaultFontFamily: "Source Serif Pro", loadSystemFonts: false },
  })
    .render()
    .asPng()

export const renderIncidentTrendPng = async (input: { readonly trend: IncidentTrend }): Promise<Buffer> => {
  const fontFile = await getChartFontFile()
  return renderToPng(buildIncidentTrendSvg(input.trend), fontFile)
}

/**
 * Build the chart SVG markup. Pure (no font fetch, no rasterisation) so it can be unit-tested
 * directly. Returns an empty-state frame when the trend carries no points.
 */
export const buildIncidentTrendSvg = (trend: IncidentTrend): string => {
  const points = trend.points
  if (points.length === 0) {
    return EMPTY_SVG
  }

  const maxCount = computeTrendMaxCount(points)
  const bucketCount = points.length
  const barSlot = INNER_W / bucketCount
  const barWidth = Math.max(2, barSlot * 0.7)
  const barInset = (barSlot - barWidth) / 2

  const bucketStartsMs = points.map((point) => Date.parse(point.t))
  const span = resolveIncidentSpan(trend, bucketStartsMs)

  const parts: string[] = []

  // Guide lines — dashed, with a solid baseline at the bottom (like the drawer's mini histogram).
  for (let i = 0; i < GUIDE_LINE_COUNT; i++) {
    const y = CHART_TOP_Y + (i * INNER_H) / (GUIDE_LINE_COUNT - 1)
    const isBaseline = i === GUIDE_LINE_COUNT - 1
    parts.push(
      `<line x1="${CHART_LEFT}" y1="${fmt(y)}" x2="${CHART_RIGHT}" y2="${fmt(y)}" stroke="${COLORS.guide}" stroke-opacity="${GUIDE_OPACITY}" stroke-width="1"${isBaseline ? "" : ' stroke-dasharray="3 3"'} />`,
    )
  }

  // Severity band behind the bars.
  if (span) {
    const bandX = CHART_LEFT + span.bandStart * barSlot
    const bandW = (span.bandEnd - span.bandStart + 1) * barSlot
    parts.push(
      `<rect x="${fmt(bandX)}" y="${CHART_TOP_Y}" width="${fmt(bandW)}" height="${INNER_H}" fill="${span.color}" fill-opacity="${SEVERITY_BAND_OPACITY}" rx="2" />`,
    )
  }

  // Occurrence bars.
  for (let i = 0; i < bucketCount; i++) {
    const count = points[i]?.count ?? 0
    if (count <= 0) continue
    const heightPx = (toVisibleHeightPercent(count, maxCount) / 100) * INNER_H
    const x = CHART_LEFT + i * barSlot + barInset
    const y = CHART_BOTTOM_Y - heightPx
    parts.push(
      `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(barWidth)}" height="${fmt(Math.max(heightPx, 1))}" rx="1.5" fill="${COLORS.bar}" fill-opacity="${BAR_OPACITY}" />`,
    )
  }

  // Dashed seasonal-expectation curve (one path per contiguous run of non-null thresholds).
  for (const segment of buildThresholdSegments(points, maxCount)) {
    const path = buildSmoothThresholdPath(segment.map((point) => toPixel(point, barSlot)))
    if (!path) continue
    parts.push(
      `<path d="${path}" fill="none" stroke="${COLORS.threshold}" stroke-opacity="${THRESHOLD_OPACITY}" stroke-width="1.5" stroke-dasharray="4 3" stroke-linecap="round" />`,
    )
  }

  // Incident start tick + dot.
  if (span && span.dotBucket !== null) {
    const cx = CHART_LEFT + (span.dotBucket + 0.5) * barSlot
    parts.push(
      `<line x1="${fmt(cx)}" y1="${CHART_TOP_Y}" x2="${fmt(cx)}" y2="${CHART_BOTTOM_Y}" stroke="${span.color}" stroke-width="1.5" />`,
      `<circle cx="${fmt(cx)}" cy="${CHART_TOP_Y}" r="3" fill="${span.color}" />`,
    )
  }

  // Day-axis labels.
  const labelIndices = pickLabelIndices(bucketCount)
  for (let i = 0; i < bucketCount; i++) {
    if (!labelIndices.has(i)) continue
    const label = formatDayLabel(points[i]?.t ?? "")
    if (!label) continue
    const cx = CHART_LEFT + (i + 0.5) * barSlot
    const anchor = i === 0 ? "start" : i === bucketCount - 1 ? "end" : "middle"
    const x = i === 0 ? CHART_LEFT : i === bucketCount - 1 ? CHART_RIGHT : cx
    parts.push(
      `<text x="${fmt(x)}" y="${HEIGHT - 9}" font-family="Source Serif Pro" font-size="11" fill="${COLORS.label}" text-anchor="${anchor}">${escapeXml(label)}</text>`,
    )
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.background}" />${parts.join("")}</svg>`
}

/**
 * Empty-state frame so the email/Slack `<Img>` still renders something anchored where the chart
 * would be when a notification row carries no trend points.
 */
const EMPTY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.background}" /><text x="${WIDTH / 2}" y="${HEIGHT / 2}" font-family="Source Serif Pro" font-size="13" fill="${COLORS.label}" text-anchor="middle" dominant-baseline="middle">No trend data</text></svg>`

/**
 * 1×1 transparent PNG used as the fallback when the request hits a notification row that doesn't
 * have a trend (e.g. `incident.event`) or the row was deleted. Returning a real PNG keeps the
 * email's `<Img>` tag from breaking into an alt-text fallback.
 */
export const TRANSPARENT_1x1_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==",
  "base64",
)
