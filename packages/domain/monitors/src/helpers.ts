import type { AlertBaseline, AlertCountThreshold, AlertDuration, AlertIncidentKind } from "@domain/shared"
import type { MonitorAlert } from "./entities/monitor.ts"

export interface HumanReadableAlertContext {
  /** Humanised saved-search name/filter; caller resolves it. Falls back to "matching traces" when absent. */
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
    return `detected ${threshold.count} times`
  }
  if (threshold.mode === "multiplier") {
    return `detected ${threshold.factor} times more than ${formatBaseline(threshold.baseline)}`
  }
  // sensitivity is the user-facing "N times more than expected"; drop it when unset.
  return threshold.sensitivity === undefined
    ? "detected more than expected"
    : `detected ${threshold.sensitivity} times more than expected`
}

const formatWindowMinutes = (minutes: number): string => {
  if (minutes < 60) return `${minutes} minutes`
  if (minutes === 60) return "1 hour"
  if (minutes % 60 === 0) return `${minutes / 60} hours`
  return `${minutes} minutes`
}

const issueSentenceForKind: Record<Extract<AlertIncidentKind, `issue.${string}`>, string> = {
  "issue.new": "Alerts each time a new issue is detected.",
  "issue.regressed": "Alerts each time a resolved issue is detected again.",
  "issue.escalating": "Alerts when an ongoing issue is being detected more than expected.",
}

/** The thing being detected is a trace; the saved search (humanised by the caller) scopes which. */
const savedSearchTraceSubject = (context?: HumanReadableAlertContext): string =>
  context?.savedSearchName ? `traces matching '${context.savedSearchName}'` : "matching traces"

/** Renders an alert as one complete sentence. Shared by the form preview, panel, and notification templates. */
export function formatHumanReadableAlert(alert: MonitorAlert, context?: HumanReadableAlertContext): string {
  if (alert.kind === "issue.new" || alert.kind === "issue.regressed" || alert.kind === "issue.escalating") {
    return issueSentenceForKind[alert.kind]
  }

  if (alert.kind === "savedSearch.match") {
    return context?.savedSearchName
      ? `Alerts each time a new trace matching '${context.savedSearchName}' is detected.`
      : "Alerts each time a new matching trace is detected."
  }

  const subject = savedSearchTraceSubject(context)

  if (alert.kind === "savedSearch.threshold" && alert.condition?.kind === "savedSearch.threshold") {
    return `Alerts when ${subject} are ${formatThreshold(alert.condition.threshold)}.`
  }

  if (alert.kind === "savedSearch.escalating" && alert.condition?.kind === "savedSearch.escalating") {
    // "sustained for at least X" keeps the window distinct from the baseline period.
    return `Alerts when ${subject} are ${formatThreshold(alert.condition.threshold)}, sustained for at least ${formatWindowMinutes(
      alert.condition.window.minutes,
    )}.`
  }

  // Defensive fallback for a malformed row (condition kind not matching alert kind).
  return `Alert configured (${alert.kind}).`
}
