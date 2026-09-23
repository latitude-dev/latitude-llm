import type { AgentScoreWeeklyDigestPayload } from "@domain/notifications"
import { formatTotalScore } from "@domain/shared"

const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

const formatDate = (date: string): string => DATE_FMT.format(new Date(`${date}T00:00:00.000Z`))

const points = (value: number): string => {
  const rounded = Math.abs(value).toFixed(1)
  return `${rounded} ${rounded === "1.0" ? "point" : "points"}`
}

/**
 * The sentence under the number.
 *
 * A delta whose intervals overlap is reported as movement that the evidence does not separate from
 * noise, rather than as an arrow: a recipient who reacts to every ±1 stops reading the ones that
 * mean something. The two `incomparable` reasons say which comparison was refused, because "no
 * change shown" and "we changed how this is measured" are different things to the reader.
 */
export const describeMovement = (comparison: AgentScoreWeeklyDigestPayload["comparison"]): string => {
  if (comparison.status === "none") {
    return "This is the first score published in the window, so there is nothing to compare it against yet."
  }
  if (comparison.status === "incomparable") {
    const since = formatDate(comparison.baselineDate)
    return comparison.reason === "scoringVersion"
      ? `Not compared against ${since}: the scoring version changed during the week, which moves the scale.`
      : `Not compared against ${since}: the scoring window changed length during the week, which changes how much evidence the score covers.`
  }

  const since = formatDate(comparison.baselineDate)
  if (comparison.delta === 0) return `Unchanged since ${since}.`

  const direction = comparison.delta > 0 ? "Up" : "Down"
  return comparison.significant
    ? `${direction} ${points(comparison.delta)} since ${since}.`
    : `${direction} ${points(comparison.delta)} since ${since}, which is within the confidence interval either way.`
}

/** How much of the week the number actually rests on. Unscored days are gaps, so they are named. */
export const describeCoverage = (payload: AgentScoreWeeklyDigestPayload): string =>
  `Scored on ${payload.publishedDayCount} of the last 7 days, over a rolling ${payload.windowDays}-day window of ${payload.eligibleSessionCount.toLocaleString("en-US")} sessions.`

export const buildHeadline = (projectName: string | null): string =>
  projectName ? `Your Agent Score for ${projectName}` : "Your weekly Agent Score"

/**
 * Inbox-skim line. Leads with the number, and appends the move only when the evidence separates it
 * from noise, so a subject that claims a change is one worth opening.
 */
export const buildSubject = (payload: AgentScoreWeeklyDigestPayload, projectName: string | null): string => {
  const scope = projectName ? ` for ${projectName}` : ""
  const base = `Agent Score ${formatTotalScore(payload.score)}${scope}`
  const { comparison } = payload
  if (comparison.status !== "comparable" || !comparison.significant || comparison.delta === 0) return base
  return `${base} (${comparison.delta > 0 ? "+" : "−"}${Math.abs(comparison.delta).toFixed(1)} this week)`
}
