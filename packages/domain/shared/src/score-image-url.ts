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

export interface ScoreImageParams {
  readonly score: number
  readonly dimensions: Partial<Record<ScoreDimension, number>>
  /** Published scores for the window, oldest first. Only the card layout draws them. */
  readonly series?: readonly number[]
  /** `ring` alone, `card` for the email's ring-plus-trend, `slack` for ring-plus-dimension-meters. */
  readonly layout?: ScoreImageLayout
}

const round = (value: number): string => value.toFixed(1).replace(/\.0$/, "")

export const agentScoreImageUrl = (webAppUrl: string, params: ScoreImageParams): string => {
  const base = webAppUrl.replace(/\/$/, "")
  const query = new URLSearchParams({ score: round(params.score) })

  const dimensions = SCORE_DIMENSIONS.map((dimension) => params.dimensions[dimension])
  if (dimensions.every((value) => value !== undefined)) {
    query.set("d", dimensions.map((value) => round(value as number)).join(","))
  }

  const layout = params.layout ?? "ring"
  if (layout !== "ring") query.set("layout", layout)
  if (layout === "card" && params.series && params.series.length > 1) {
    query.set("s", params.series.map(round).join(","))
  }

  return `${base}/api/agent-score/ring.png?${query.toString()}`
}
