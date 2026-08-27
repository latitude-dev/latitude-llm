import type { CauseEvidence, CauseSeverity } from "./agent-score-mock.ts"

export const DASH = "—"

/** Lighthouse-style bands: the number's colour is the only thing that has to be read at a glance. */
type ScoreBand = "good" | "mid" | "poor"

export const scoreBand = (score: number): ScoreBand => (score >= 90 ? "good" : score >= 50 ? "mid" : "poor")

/**
 * Colours follow the `Status` component's palette rather than the muted foreground tokens: those
 * sit two lightness steps from the panel they render on, which left the bars almost invisible.
 */
export const BAND_TEXT: Record<ScoreBand, string> = {
  good: "text-green-700 dark:text-green-400",
  mid: "text-amber-700 dark:text-amber-400",
  poor: "text-rose-700 dark:text-rose-400",
}

export const BAND_SURFACE: Record<ScoreBand, string> = {
  good: "bg-green-500/15 dark:bg-green-500/20",
  mid: "bg-amber-500/15 dark:bg-amber-500/20",
  poor: "bg-rose-500/15 dark:bg-rose-500/20",
}

export const SEVERITY_FILL: Record<CauseSeverity, string> = {
  ruined: "bg-rose-600 dark:bg-rose-500",
  degraded: "bg-amber-500 dark:bg-amber-400",
}

export const BAR_TRACK = "bg-foreground/10"

/** Hover on a `bg-secondary` panel. `bg-muted` is 2% off it in light mode and reads as nothing. */
export const ROW_HOVER = "hover:bg-secondary-muted-hover"

export const formatScore = (score: number | null): string =>
  score === null ? DASH : String(Math.round(score * 10) / 10)

/** Points always read as a deduction, so the sign is part of the format. */
export const formatPoints = (points: number | null): string =>
  points === null ? DASH : points === 0 ? "0.0" : `−${points.toFixed(1)}`

export const formatSessions = (sessions: number): string => sessions.toLocaleString("en-US")

export const SEVERITY_META: Record<CauseSeverity, { readonly label: string; readonly hint: string }> = {
  ruined: {
    label: "Failed",
    hint: "The session ended badly, so it counts in full.",
  },
  degraded: {
    label: "Degraded",
    hint: "The session hit trouble and recovered, so it counts half.",
  },
}

export const EVIDENCE_META: Record<CauseEvidence, { readonly label: string; readonly hint: string }> = {
  mechanical: {
    label: "Metric",
    hint: "Read straight from your telemetry, on every session. No model involved.",
  },
  flagger: {
    label: "Flagger",
    hint: "A code flagger. It runs on every session, so it counts here whether or not it became a signal.",
  },
  signal: {
    label: "Signal",
    hint: "A promoted signal. What a model spotted counts only after the same problem has shown up repeatedly.",
  },
  moment: {
    label: "Moment",
    hint: "Conversation intelligence reads every session that ends, with no sampling.",
  },
}
