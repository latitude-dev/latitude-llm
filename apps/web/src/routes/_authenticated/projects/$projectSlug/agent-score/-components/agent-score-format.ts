import type { AgentScoreRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"

export const SCORE_DIMENSION_ORDER = ["outcome", "reliability", "cost", "speed", "safety"] as const
export type ScoreDimensionKey = (typeof SCORE_DIMENSION_ORDER)[number]

export const DIMENSION_LABEL: Record<ScoreDimensionKey, string> = {
  outcome: "Outcome",
  reliability: "Reliability",
  cost: "Cost",
  speed: "Speed",
  safety: "Safety",
}

/**
 * What each number means, in the dimension's own terms.
 *
 * Every dimension is on a 0 to 100 scale and none of them measures the same thing, so a score shown
 * without its meaning invites the reader to compare Outcome 80 with Cost 80 as if they were the same
 * claim. These sentences are the whole reason the cards are not just five numbers.
 */
export const DIMENSION_MEANING: Record<ScoreDimensionKey, string> = {
  outcome: "Share of comparable sessions expected to accomplish what the user asked.",
  reliability: "Chance of 20 consecutive sessions completing without a terminal operational failure.",
  cost: "Health of the agent's use of paid and token-bearing resources. Not a share of spend.",
  speed: "Share of user-visible critical-path time that was necessary.",
  safety: "Chance of 100 sessions with no confirmed agent-caused harm.",
}

export const formatScore = (value: number): string => value.toFixed(0)

export const formatInterval = (interval: { readonly lower: number; readonly upper: number }): string =>
  `${interval.lower.toFixed(0)} to ${interval.upper.toFixed(0)}`

export const formatCount = (value: number): string => value.toLocaleString()

/** A rate the Reliability card must show beside its score, derived from the compounded value. */
export const oneSessionSuccessRate = (reliability: number): number => (reliability / 100) ** (1 / 20)

export const formatPercent = (value: number, digits = 1): string => `${(value * 100).toFixed(digits)}%`

export const formatHours = (nanoseconds: number): string => {
  const hours = nanoseconds / 3_600_000_000_000
  return hours >= 10 ? `${hours.toFixed(0)}h` : `${hours.toFixed(1)}h`
}

export const dimensionOf = (snapshot: AgentScoreRecord, dimension: ScoreDimensionKey) => snapshot.dimensions[dimension]

export const formatDate = (date: string): string =>
  new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
