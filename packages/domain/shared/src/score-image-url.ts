import { SCORE_DIMENSIONS, type ScoreDimension } from "./score-evidence.ts"

/**
 * URL of the server-rendered Agent Score image the weekly digest's email and Slack message embed.
 *
 * Built here rather than at each call site because the query format is a contract between three
 * places — the `apps/web` route that parses it and the two renderers that produce it — and a
 * silently mismatched parameter name would show up as a missing image rather than a failure.
 *
 * Every value is a score. Nothing identifying travels in this URL, which is what lets the image be
 * public, unsigned, and cached by value across organisations.
 */
export type ScoreImageLayout = "ring" | "card" | "slack"

export interface ScoreImageTrend {
  /** Inclusive UTC date bounds of the window, `YYYY-MM-DD`. */
  readonly from: string
  readonly to: string
  /** The published days, in any order; a day with no score is simply absent. */
  readonly points: readonly { readonly date: string; readonly score: number }[]
}

export interface ScoreImageParams {
  readonly score: number
  readonly dimensions: Partial<Record<ScoreDimension, number>>
  /** The window's published days. Only the card layout draws them. */
  readonly trend?: ScoreImageTrend
  /** `ring` alone, `card` for the email's ring-plus-trend, `slack` for ring-plus-dimension-meters. */
  readonly layout?: ScoreImageLayout
}

const round = (value: number): string => value.toFixed(1).replace(/\.0$/, "")

const DAY_MS = 86_400_000

/**
 * One slot per day of the window, empty where the day published no score.
 *
 * Positional rather than a list of scores, because a withheld day writes no row: a week scored on
 * Tuesday, Wednesday and Monday would otherwise be drawn as three evenly spaced points, putting
 * Wednesday in the middle of the week and misplacing every movement after a gap.
 */
const trendSlots = (trend: ScoreImageTrend): string[] => {
  const byDate = new Map(trend.points.map((point) => [point.date, point.score]))
  const start = Date.parse(`${trend.from}T00:00:00.000Z`)
  const end = Date.parse(`${trend.to}T00:00:00.000Z`)
  const slots: string[] = []
  for (let at = start; at <= end; at += DAY_MS) {
    const score = byDate.get(new Date(at).toISOString().slice(0, 10))
    slots.push(score === undefined ? "" : round(score))
  }
  return slots
}

export const agentScoreImageUrl = (webAppUrl: string, params: ScoreImageParams): string => {
  const base = webAppUrl.replace(/\/$/, "")
  const query = new URLSearchParams({ score: round(params.score) })

  const dimensions = SCORE_DIMENSIONS.map((dimension) => params.dimensions[dimension])
  if (dimensions.every((value) => value !== undefined)) {
    query.set("d", dimensions.map((value) => round(value as number)).join(","))
  }

  const layout = params.layout ?? "ring"
  if (layout !== "ring") query.set("layout", layout)
  if (layout === "card" && params.trend && params.trend.points.length > 1) {
    query.set("s", trendSlots(params.trend).join(","))
  }

  return `${base}/api/agent-score/ring.png?${query.toString()}`
}
