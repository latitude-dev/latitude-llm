import {
  buildWeightedRingSegments,
  clampScore,
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
const STROKE_WIDTH = 5
const OUTER_IDLE_OPACITY = 0.5
const OUTER_TRACK_OPACITY = 0.22
const INNER_TRACK_OPACITY = 0.16
const TRACK_COLOR = "#66727F"

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

/** The ring alone, in a 100×100 user-space box the caller places. */
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

  for (const segment of segments) {
    parts.push(
      arc({
        radius: OUTER_RADIUS,
        length: segment.length,
        offset: segment.start,
        color: TRACK_COLOR,
        opacity: OUTER_TRACK_OPACITY,
        total: outerLength,
      }),
    )
    if (segment.score === null) continue
    const progress = segment.length * (clampScore(segment.score) / 100)
    if (progress <= 0) continue
    parts.push(
      arc({
        radius: OUTER_RADIUS,
        length: progress,
        offset: segment.start,
        color: scoreBandColor(segment.score),
        opacity: OUTER_IDLE_OPACITY,
        total: outerLength,
      }),
    )
  }

  parts.push(
    `<circle cx="${CENTER}" cy="${CENTER}" r="${INNER_RADIUS}" fill="none" stroke="${TRACK_COLOR}" stroke-opacity="${INNER_TRACK_OPACITY}" stroke-width="${STROKE_WIDTH}" />`,
  )
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

  const label = input.score === null ? "—" : input.score.toFixed(1)
  parts.push(
    `<text x="${CENTER}" y="${CENTER}" font-family="Inter" font-size="19" font-weight="600" fill="${scoreBandColor(input.score)}" text-anchor="middle" dominant-baseline="central">${escapeXml(label)}</text>`,
  )

  return parts.join("")
}

const svgDocument = (width: number, height: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#FFFFFF" />${body}</svg>`

/** Square ring on its own — the shape Slack renders as a section accessory. */
export const buildScoreRingSvg = (input: ScoreRingInput): string =>
  svgDocument(VIEWBOX, VIEWBOX, buildRingMarkup(input))

interface ScoreCardInput extends ScoreRingInput {
  /** Published days in the window, oldest first. Fewer than two points draws no trend. */
  readonly series: readonly number[]
}

const PANEL_FILL = "#F8FAFC"
const PANEL_RADIUS = 12
const RING_PANEL_WIDTH = 200
const PANEL_GAP = 12

const TREND_PANEL_LEFT = RING_PANEL_WIDTH + PANEL_GAP
const TREND_LEFT = TREND_PANEL_LEFT + 24
const TREND_RIGHT = CARD_WIDTH - 24
const TREND_TOP = 52
const TREND_BOTTOM = CARD_HEIGHT - 28
const TREND_COLOR = "#5B9BE8"
const TREND_FILL_OPACITY = 0.16

/**
 * The week's published scores as a filled area, mirroring the score page's "Score evolution" panel.
 *
 * Scaled to the series' own range rather than 0–100: a project sitting at 97–99 all week would
 * otherwise draw a flat line at the top and say nothing about its week. A padded range keeps the
 * shape readable while the ring carries the absolute value.
 */
const buildTrendMarkup = (series: readonly number[]): string => {
  if (series.length < 2) return ""

  const min = Math.min(...series)
  const max = Math.max(...series)
  const padding = Math.max(1, (max - min) * 0.25)
  const low = Math.max(0, min - padding)
  const high = Math.min(100, max + padding)
  const span = high - low || 1

  const width = TREND_RIGHT - TREND_LEFT
  const height = TREND_BOTTOM - TREND_TOP
  const points = series.map((score, index) => ({
    x: TREND_LEFT + (index / (series.length - 1)) * width,
    y: TREND_BOTTOM - ((clampScore(score) - low) / span) * height,
  }))

  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${fmt(point.x)},${fmt(point.y)}`).join(" ")
  const area = `${line} L${fmt(TREND_RIGHT)},${fmt(TREND_BOTTOM)} L${fmt(TREND_LEFT)},${fmt(TREND_BOTTOM)} Z`

  const dots = points
    .map(
      (point) =>
        `<circle cx="${fmt(point.x)}" cy="${fmt(point.y)}" r="3" fill="#FFFFFF" stroke="${TREND_COLOR}" stroke-width="2" />`,
    )
    .join("")

  return [
    `<path d="${area}" fill="${TREND_COLOR}" fill-opacity="${TREND_FILL_OPACITY}" />`,
    `<path d="${line}" fill="none" stroke="${TREND_COLOR}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`,
    dots,
    `<text x="${TREND_LEFT}" y="${TREND_TOP - 20}" font-family="Inter" font-size="12" fill="#66727F">Score evolution</text>`,
  ].join("")
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
