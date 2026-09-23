import {
  buildWeightedRingSegments,
  clampScore,
  formatTotalScore,
  SCORE_DIMENSION_LABELS,
  SCORE_DIMENSIONS,
  type ScoreDimension,
  scoreBandColor,
} from "@domain/shared"
import { Resvg } from "@resvg/resvg-js"
import { getScoreFontFiles } from "./fonts.ts"

/**
 * Server-side renderer for the Agent Score ring embedded in the weekly digest's email and Slack
 * message. It mirrors the score page's `VitalityScoreRing` — same radii, same stroke widths, same
 * per-dimension outer segments weighted by the composite weights, same band colours — so the digest
 * shows the reader the ring they already know rather than a second visual language for one number.
 *
 * Hand-authored SVG rasterised by Resvg rather than Satori, for the same reason the incident-trend
 * chart is: an arc gauge is built entirely from `stroke-dasharray`, which Satori does not render.
 *
 * Light theme only, and no tenant data reaches this file — the inputs are scores between 0 and 100.
 */

const VIEWBOX = 100
const CENTER = 50
const OUTER_RADIUS = 45
const INNER_RADIUS = 36
const STROKE_WIDTH = 4
const OUTER_IDLE_OPACITY = 0.6
const DISC_OPACITY = 0.1
const FOREGROUND = "#030711"
const MUTED = "#66727F"

// The page draws the ring in a 176px box, so its 30px number and 12px label are 17 and 6.8 units
// here, stacked with its 4px gap and centred as one block.
const NUMBER_SIZE = 17
const NUMBER_CENTER_Y = 44.3
const LABEL_SIZE = 6.8
const LABEL_CENTER_Y = 61.4

const RING_SIZE = 240
const CARD_WIDTH = 600
const CARD_HEIGHT = 200

const circumference = (radius: number) => 2 * Math.PI * radius

const fmt = (value: number): string => value.toFixed(2)

const escapeXml = (value: string): string => value.replace(/[<>&'"]/g, (char) => `&#${char.charCodeAt(0)};`)

interface ScoreRingInput {
  readonly score: number | null
  /** Per-dimension scores driving the outer segments; a missing dimension draws its track only. */
  readonly dimensions: Partial<Record<ScoreDimension, number | null>>
  /** Composite weights, so each segment's arc is as long as its contribution to the score. */
  readonly weights: Record<ScoreDimension, number>
}

const arc = (input: {
  readonly radius: number
  readonly length: number
  readonly offset: number
  readonly color: string
  readonly opacity: number
  readonly total: number
}): string =>
  `<circle cx="${CENTER}" cy="${CENTER}" r="${input.radius}" fill="none" stroke="${input.color}" stroke-opacity="${input.opacity}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-dasharray="${fmt(input.length)} ${fmt(input.total - input.length)}" stroke-dashoffset="${fmt(-input.offset)}" transform="rotate(-90 ${CENTER} ${CENTER})" />`

/**
 * The ring alone, in a 100×100 user-space box the caller places.
 *
 * Each dimension's outer segment is drawn at its full weighted length in its own band colour, and
 * the inner arc is the only one whose length is the score. That is the page's reading of the ring:
 * the outer ring says which dimension is where, the inner ring says how far the whole agent got.
 */
const buildRingMarkup = (input: ScoreRingInput): string => {
  const outerLength = circumference(OUTER_RADIUS)
  const innerLength = circumference(INNER_RADIUS)
  const segments = buildWeightedRingSegments(
    SCORE_DIMENSIONS.map((dimension) => ({
      id: dimension,
      weight: input.weights[dimension],
      score: input.dimensions[dimension] ?? null,
    })),
    outerLength,
  )

  const parts: string[] = []

  if (input.score !== null) {
    parts.push(
      `<circle cx="${CENTER}" cy="${CENTER}" r="${INNER_RADIUS - STROKE_WIDTH / 2}" fill="${scoreBandColor(input.score)}" fill-opacity="${DISC_OPACITY}" />`,
    )
  }

  for (const segment of segments) {
    if (segment.score === null || segment.length <= 0) continue
    parts.push(
      arc({
        radius: OUTER_RADIUS,
        length: segment.length,
        offset: segment.start,
        color: scoreBandColor(segment.score),
        opacity: OUTER_IDLE_OPACITY,
        total: outerLength,
      }),
    )
  }

  if (input.score !== null) {
    parts.push(
      arc({
        radius: INNER_RADIUS,
        length: innerLength * (clampScore(input.score) / 100),
        offset: 0,
        color: scoreBandColor(input.score),
        opacity: 1,
        total: innerLength,
      }),
    )
  }

  const label = input.score === null ? "—" : formatTotalScore(input.score)
  parts.push(
    `<text x="${CENTER}" y="${NUMBER_CENTER_Y}" font-family="Inter" font-size="${NUMBER_SIZE}" font-weight="600" fill="${FOREGROUND}" text-anchor="middle" dominant-baseline="central">${escapeXml(label)}</text>`,
    `<text x="${CENTER}" y="${LABEL_CENTER_Y}" font-family="Inter" font-size="${LABEL_SIZE}" fill="${MUTED}" text-anchor="middle" dominant-baseline="central">Agent vitality</text>`,
  )

  return parts.join("")
}

const svgDocument = (width: number, height: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#FFFFFF" />${body}</svg>`

/** Square ring on its own — the shape Slack renders as a section accessory. */
export const buildScoreRingSvg = (input: ScoreRingInput): string =>
  svgDocument(VIEWBOX, VIEWBOX, buildRingMarkup(input))

interface ScoreCardInput extends ScoreRingInput {
  /**
   * One slot per day of the window, `null` for a day that published no score. Fewer than two
   * published days draws no trend, since one point has no shape to show.
   */
  readonly series: readonly (number | null)[]
}

const PANEL_FILL = "#F8FAFC"
const PANEL_RADIUS = 12
const RING_PANEL_WIDTH = 200
const PANEL_GAP = 12

const TREND_PANEL_LEFT = RING_PANEL_WIDTH + PANEL_GAP
const TREND_LEFT = TREND_PANEL_LEFT + 24
const TREND_RIGHT = CARD_WIDTH - 24
const TREND_TOP = 28
const TREND_BOTTOM = CARD_HEIGHT - 28
const TREND_COLOR = "#2B7FFF"
const TREND_FILL_OPACITY = 0.16

/**
 * The week's published scores as a filled area, mirroring the score page's trend.
 *
 * Scaled to the series' own range rather than 0–100: a project sitting at 97–99 all week would
 * otherwise draw a flat line at the top and say nothing about its week. A padded range keeps the
 * shape readable while the ring carries the absolute value.
 */
const buildTrendMarkup = (series: readonly (number | null)[]): string => {
  const published = series.filter((score): score is number => score !== null)
  if (published.length < 2) return ""

  const min = Math.min(...published)
  const max = Math.max(...published)
  const padding = Math.max(1, (max - min) * 0.25)
  const low = Math.max(0, min - padding)
  const high = Math.min(100, max + padding)
  const span = high - low || 1

  const width = TREND_RIGHT - TREND_LEFT
  const height = TREND_BOTTOM - TREND_TOP
  const xOf = (day: number) => TREND_LEFT + (series.length > 1 ? (day / (series.length - 1)) * width : 0)
  const yOf = (score: number) => TREND_BOTTOM - ((clampScore(score) - low) / span) * height

  // Each point sits on its own day, and the line stops at an unscored day rather than bridging it:
  // the score page leaves those days as gaps, and a line drawn across one would invent a value.
  const runs: { readonly x: number; readonly y: number }[][] = []
  let run: { readonly x: number; readonly y: number }[] = []
  series.forEach((score, day) => {
    if (score === null) {
      if (run.length > 0) runs.push(run)
      run = []
      return
    }
    run.push({ x: xOf(day), y: yOf(score) })
  })
  if (run.length > 0) runs.push(run)

  const parts: string[] = []
  for (const points of runs) {
    if (points.length < 2) continue
    const first = points[0] as { readonly x: number; readonly y: number }
    const last = points[points.length - 1] as { readonly x: number; readonly y: number }
    const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${fmt(point.x)},${fmt(point.y)}`).join(" ")
    parts.push(
      `<path d="${line} L${fmt(last.x)},${fmt(TREND_BOTTOM)} L${fmt(first.x)},${fmt(TREND_BOTTOM)} Z" fill="${TREND_COLOR}" fill-opacity="${TREND_FILL_OPACITY}" />`,
      `<path d="${line}" fill="none" stroke="${TREND_COLOR}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`,
    )
  }
  for (const point of runs.flat()) {
    parts.push(
      `<circle cx="${fmt(point.x)}" cy="${fmt(point.y)}" r="3" fill="#FFFFFF" stroke="${TREND_COLOR}" stroke-width="2" />`,
    )
  }

  return parts.join("")
}

/**
 * Ring plus the week's trend, laid out like the score page's header row. One image rather than two
 * so an email costs a single request, and so the two halves cannot load out of step.
 */
export const buildScoreCardSvg = (input: ScoreCardInput): string => {
  const ringBox = 152
  const ringX = (RING_PANEL_WIDTH - ringBox) / 2
  const ringY = (CARD_HEIGHT - ringBox) / 2
  const scale = ringBox / VIEWBOX

  const panel = (x: number, width: number): string =>
    `<rect x="${x}" y="0" width="${width}" height="${CARD_HEIGHT}" rx="${PANEL_RADIUS}" fill="${PANEL_FILL}" />`

  const body = [
    panel(0, RING_PANEL_WIDTH),
    panel(TREND_PANEL_LEFT, CARD_WIDTH - TREND_PANEL_LEFT),
    `<g transform="translate(${ringX} ${ringY}) scale(${fmt(scale)})">${buildRingMarkup(input)}</g>`,
    buildTrendMarkup(input.series),
  ].join("")

  return svgDocument(CARD_WIDTH, CARD_HEIGHT, body)
}

const renderToPng = async (svg: string, width: number): Promise<Buffer> => {
  const fontFiles = await getScoreFontFiles()
  return new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles, defaultFontFamily: "Inter", loadSystemFonts: false },
  })
    .render()
    .asPng()
}

const SLACK_WIDTH = 640
const SLACK_HEIGHT = 220
const SLACK_RING_PANEL = 200
const BAR_TRACK = "#E2E8F0"
const LABEL_COLOR = "#475569"

/**
 * Ring plus every dimension as a meter, for Slack.
 *
 * Slack renders emoji half again the size of its text, so five dimensions as text lines become a
 * column of colliding circles; and a coloured attachment collapses tall content behind "Show more".
 * Drawing the breakdown instead sidesteps both, and matches how the score page reads.
 */
export const buildScoreSlackCardSvg = (input: ScoreRingInput): string => {
  const ringBox = 152
  const ringX = (SLACK_RING_PANEL - ringBox) / 2
  const ringY = (SLACK_HEIGHT - ringBox) / 2
  const scale = ringBox / VIEWBOX

  const rowCenters = [42, 76, 110, 144, 178]
  const barLeft = 352
  const barWidth = 150
  const barHeight = 6

  const rows = SCORE_DIMENSIONS.flatMap((dimension, index) => {
    const score = input.dimensions[dimension] ?? null
    const center = rowCenters[index] as number
    const color = scoreBandColor(score)
    const filled = score === null ? 0 : barWidth * (clampScore(score) / 100)

    return [
      `<text x="224" y="${center}" font-family="Inter" font-size="13" fill="${LABEL_COLOR}" dominant-baseline="central">${escapeXml(SCORE_DIMENSION_LABELS[dimension])}</text>`,
      `<rect x="${barLeft}" y="${center - barHeight / 2}" width="${barWidth}" height="${barHeight}" rx="${barHeight / 2}" fill="${BAR_TRACK}" />`,
      ...(filled > 0
        ? [
            `<rect x="${barLeft}" y="${center - barHeight / 2}" width="${fmt(filled)}" height="${barHeight}" rx="${barHeight / 2}" fill="${color}" />`,
          ]
        : []),
      `<text x="548" y="${center}" font-family="Inter" font-size="14" font-weight="600" fill="${color}" text-anchor="end" dominant-baseline="central">${score === null ? "—" : score.toFixed(0)}</text>`,
    ]
  })

  const body = [
    `<rect x="0" y="0" width="${SLACK_RING_PANEL}" height="${SLACK_HEIGHT}" rx="${PANEL_RADIUS}" fill="${PANEL_FILL}" />`,
    `<g transform="translate(${ringX} ${ringY}) scale(${fmt(scale)})">${buildRingMarkup(input)}</g>`,
    ...rows,
  ].join("")

  return svgDocument(SLACK_WIDTH, SLACK_HEIGHT, body)
}

export const renderScoreSlackCardPng = (input: ScoreRingInput): Promise<Buffer> =>
  renderToPng(buildScoreSlackCardSvg(input), SLACK_WIDTH)

export const renderScoreRingPng = (input: ScoreRingInput): Promise<Buffer> =>
  renderToPng(buildScoreRingSvg(input), RING_SIZE)

export const renderScoreCardPng = (input: ScoreCardInput): Promise<Buffer> =>
  renderToPng(buildScoreCardSvg(input), CARD_WIDTH)

/** 1×1 transparent PNG, the fallback when anything at all goes wrong. */
export const TRANSPARENT_1x1_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)
