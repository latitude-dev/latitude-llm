import type { AlertBaseline, AlertCountThreshold, AlertDuration, AlertIncidentKind } from "@domain/shared"
import type { MonitorAlert } from "./entities/monitor.ts"

export interface HumanReadableAlertContext {
  /** Saved-search display name; caller resolves it. Falls back to "a saved search" when absent. */
  readonly savedSearchName?: string
}

const formatDuration = (duration: AlertDuration): string => {
  if (duration.unit === "hours") {
    if (duration.hours === 1) return "the last hour"
    if (duration.hours === 24) return "the last 24 hours"
    return `the last ${duration.hours} hours`
  }
  if (duration.days === 1) return "the last day"
  if (duration.days === 7) return "the last 7 days"
  return `the last ${duration.days} days`
}

const formatPreviousPeriod = (duration: AlertDuration): string => {
  if (duration.unit === "hours") {
    return duration.hours === 1 ? "the previous hour" : `the previous ${duration.hours} hours`
  }
  if (duration.days === 1) return "yesterday"
  if (duration.days === 7) return "the previous week"
  return `the previous ${duration.days} days`
}

const formatBaseline = (baseline: AlertBaseline): string =>
  baseline.kind === "average"
    ? `the average of ${formatDuration(baseline.lookback)}`
    : formatPreviousPeriod(baseline.lookback)

const formatThreshold = (threshold: AlertCountThreshold): string => {
  if (threshold.mode === "absolute") {
    return `occurred ${threshold.count} times`
  }
  if (threshold.mode === "multiplier") {
    return `occurred ${threshold.factor} times more than ${formatBaseline(threshold.baseline)}`
  }
  // sensitivity is the user-facing "N times more than expected"; drop it when unset.
  return threshold.sensitivity === undefined
    ? "occurred more than expected"
    : `occurred ${threshold.sensitivity} times more than expected`
}

const formatWindowMinutes = (minutes: number): string => {
  if (minutes < 60) return `${minutes} minutes`
  if (minutes === 60) return "1 hour"
  if (minutes % 60 === 0) return `${minutes / 60} hours`
  return `${minutes} minutes`
}

const issueSentenceForKind: Record<Extract<AlertIncidentKind, `issue.${string}`>, string> = {
  "issue.new": "Alert me every time a new issue is discovered.",
  "issue.regressed": "Alert me every time a resolved issue regresses.",
  "issue.escalating": "Alert me when an issue's occurrence rate crosses the project escalation threshold.",
}

const savedSearchSubject = (alert: MonitorAlert, context?: HumanReadableAlertContext): string => {
  if (context?.savedSearchName) return `'${context.savedSearchName}' matches`
  if (alert.source.id === null) return "saved-search matches"
  return "matches of a saved search"
}

/** Renders an alert as one complete sentence. Shared by the form preview, panel, and notification templates. */
export function formatHumanReadableAlert(alert: MonitorAlert, context?: HumanReadableAlertContext): string {
  if (alert.kind === "issue.new" || alert.kind === "issue.regressed" || alert.kind === "issue.escalating") {
    return issueSentenceForKind[alert.kind]
  }

  const subject = savedSearchSubject(alert, context)

  if (alert.kind === "savedSearch.match") {
    return `Alert me every time a trace matches ${context?.savedSearchName ? `'${context.savedSearchName}'` : "a saved search"}.`
  }

  if (alert.kind === "savedSearch.threshold" && alert.condition?.kind === "savedSearch.threshold") {
    return `Alert me when ${subject} ${formatThreshold(alert.condition.threshold)}.`
  }

  if (alert.kind === "savedSearch.escalating" && alert.condition?.kind === "savedSearch.escalating") {
    // "sustained for at least X" keeps the window distinct from the baseline period.
    return `Alert me when ${subject} ${formatThreshold(alert.condition.threshold)}, sustained for at least ${formatWindowMinutes(
      alert.condition.window.minutes,
    )}.`
  }

  // Defensive fallback for a malformed row (condition kind not matching alert kind).
  return `Alert configured (${alert.kind}).`
}
