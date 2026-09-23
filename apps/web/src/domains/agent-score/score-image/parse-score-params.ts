import { SCORE_DIMENSIONS, type ScoreDimension } from "@domain/shared"

/**
 * Reads the ring's inputs off a query string.
 *
 * Every value is a score between 0 and 100 and nothing else — no ids, no names, no tenant of any
 * kind — which is why these images need no signed URL and can be cached by value. Anything
 * unparseable is dropped rather than rejected: the image is decoration on a message whose text
 * already carries the numbers, so a malformed parameter should still draw something.
 */

const clamp = (value: number): number => Math.max(0, Math.min(100, value))

const toScore = (raw: string | null): number | null => {
  if (raw === null || raw.trim() === "") return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? clamp(parsed) : null
}

/** Positional: an empty or unparseable slot stays in place as `null` rather than shifting the rest. */
const toScoreSlots = (raw: string | null): (number | null)[] =>
  raw === null || raw === "" ? [] : raw.split(",").map((part) => toScore(part))

interface ParsedScoreParams {
  readonly score: number | null
  readonly dimensions: Partial<Record<ScoreDimension, number | null>>
  /**
   * One slot per day of the window, `null` for a day that published no score. Capped so a crafted
   * URL cannot draw thousands of points.
   */
  readonly series: readonly (number | null)[]
}

const MAX_SERIES_POINTS = 31

/**
 * `?score=71.4&d=74,81,66,70,92&s=68.9,,70,71.4`
 *
 * Both lists are positional: `d` in `SCORE_DIMENSIONS` order, `s` one slot per day of the window
 * with a gap left empty. That keeps the URL short enough to stay readable in a Slack block and an
 * email source.
 */
export const parseScoreParams = (url: URL): ParsedScoreParams => {
  const dimensionScores = toScoreSlots(url.searchParams.get("d"))
  const dimensions: Partial<Record<ScoreDimension, number | null>> = {}
  SCORE_DIMENSIONS.forEach((dimension, index) => {
    const value = dimensionScores[index]
    if (value !== undefined) dimensions[dimension] = value
  })

  return {
    score: toScore(url.searchParams.get("score")),
    dimensions,
    series: toScoreSlots(url.searchParams.get("s")).slice(0, MAX_SERIES_POINTS),
  }
}
