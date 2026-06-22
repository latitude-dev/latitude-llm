import {
  type AlertBaseline,
  type AlertCountThreshold,
  type AlertDuration,
  type AlertIncidentKind,
  type AlertMetricThreshold,
  formatMetricValue,
  type MonitorMetric,
} from "@domain/shared"
import type { MonitorAlert } from "./entities/monitor.ts"

export interface HumanReadableAlertContext {
  /** Humanised saved-search name/filter; caller resolves it. Falls back to "matching traces" when absent. */
  readonly savedSearchName?: string
  /** Humanised target (e.g. "the `search` tool", "all users") for unified `event.*`/`metric.*` alerts. */
  readonly targetName?: string
}

/** The slice of an alert the formatter reads. Notification templates pass just these two from the incident payload. */
export type HumanReadableAlertInput = Pick<MonitorAlert, "kind" | "condition">

const formatDuration = (duration: AlertDuration): string => {
  if (duration.unit === "minutes") {
    return duration.minutes === 1 ? "the last minute" : `the last ${duration.minutes} minutes`
  }
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
  if (duration.unit === "minutes") {
    return duration.minutes === 1 ? "the previous minute" : `the previous ${duration.minutes} minutes`
  }
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

const formatMetricBaseline = (baseline: AlertBaseline): string =>
  baseline.kind === "average"
    ? `the same metric averaged over ${formatDuration(baseline.lookback)}`
    : `the same metric during ${formatPreviousPeriod(baseline.lookback)}`

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
  if (minutes > 0 && minutes % 1440 === 0) {
    const days = minutes / 1440
    return days === 1 ? "1 day" : `${days} days`
  }
  if (minutes > 0 && minutes % 60 === 0) {
    const hours = minutes / 60
    return hours === 1 ? "1 hour" : `${hours} hours`
  }
  return `${minutes} minutes`
}

const signalSentenceForKind: Record<Extract<AlertIncidentKind, `issue.${string}`>, string> = {
  "issue.new": "Opens an incident each time a new issue is detected.",
  "issue.regressed": "Opens an incident each time a resolved signal is detected again.",
  "issue.escalating": "Opens an incident when an ongoing signal is being detected more than expected.",
}

/** The thing being detected is a trace; the saved search (humanised by the caller) scopes which. */
const savedSearchTraceSubject = (context?: HumanReadableAlertContext): string =>
  context?.savedSearchName ? `traces matching '${context.savedSearchName}'` : "matching traces"

/** Field rendered as a user-facing word: duration reads as "latency". */
const metricFieldNoun = (field: "duration" | "cost" | "tokens"): string =>
  field === "duration" ? "latency" : field === "tokens" ? "token count" : "cost"

/** How a unified monitor's metric reads as a noun phrase ("the error rate", "the p95 latency"). */
const formatMetric = (metric: MonitorMetric): string => {
  switch (metric.kind) {
    case "count":
      return "the volume"
    case "errorRate":
      return "the error rate"
    case "sum":
      return `the total ${metricFieldNoun(metric.field)}`
    case "min":
      return `the lowest observed ${metricFieldNoun(metric.field)}`
    case "max":
      return `the highest observed ${metricFieldNoun(metric.field)}`
    case "avg":
      return `the average ${metricFieldNoun(metric.field)}`
    case "median":
      return `the median ${metricFieldNoun(metric.field)}`
    case "p95":
      return `the p95 ${metricFieldNoun(metric.field)}`
  }
}

const matchingEntity = (target: string): string => (target.includes("tool") ? "matching tool call" : "matching session")

const targetScope = (target: string): string => (target.startsWith("all ") ? `among ${target}` : `for ${target}`)

const formatMetricSubject = (metric: MonitorMetric, context?: HumanReadableAlertContext): string => {
  const target = targetSubject(context)
  if (metric.kind === "min" || metric.kind === "max") {
    const entity = matchingEntity(target)
    const scope = target === "the target" ? "" : ` ${targetScope(target)}`
    if (metric.field === "cost")
      return metric.kind === "min" ? `the cheapest ${entity}${scope}` : `the most expensive ${entity}${scope}`
    if (metric.field === "duration")
      return metric.kind === "min" ? `the fastest ${entity}${scope}` : `the slowest ${entity}${scope}`
    return metric.kind === "min"
      ? `the ${entity} with the fewest tokens${scope}`
      : `the ${entity} with the most tokens${scope}`
  }
  return `${formatMetric(metric)} for ${target}`
}

/** Threshold phrase for the unified `metric.*` kinds; absolute carries a stored float `value` rendered with its unit. */
const formatMetricThreshold = (
  threshold: AlertMetricThreshold,
  metric: MonitorMetric,
  direction: "above" | "below" = "above",
): string => {
  if (threshold.mode === "absolute") {
    return `${direction === "below" ? "under" : "over"} ${formatMetricValue(threshold.value, metric)}`
  }
  if (threshold.mode === "multiplier") {
    return `${threshold.factor} times ${direction === "below" ? "less than" : "more than"} ${formatMetricBaseline(threshold.baseline)}`
  }
  const comparator = direction === "below" ? "less than expected" : "more than expected"
  return threshold.sensitivity === undefined ? comparator : `${threshold.sensitivity} times ${comparator}`
}

const targetSubject = (context?: HumanReadableAlertContext): string => context?.targetName ?? "the target"

/** Renders an alert as one complete sentence. Shared by the form preview, panel, and notification templates. */
export function formatHumanReadableAlert(alert: HumanReadableAlertInput, context?: HumanReadableAlertContext): string {
  if (alert.kind === "issue.new" || alert.kind === "issue.regressed" || alert.kind === "issue.escalating") {
    return signalSentenceForKind[alert.kind]
  }

  if (alert.kind === "savedSearch.match") {
    return context?.savedSearchName
      ? `Opens an incident each time a new trace matching '${context.savedSearchName}' is detected.`
      : "Opens an incident each time a new matching trace is detected."
  }

  const subject = savedSearchTraceSubject(context)

  if (alert.kind === "savedSearch.threshold" && alert.condition?.kind === "savedSearch.threshold") {
    return `Opens an incident when ${subject} are ${formatThreshold(alert.condition.threshold)}.`
  }

  if (alert.kind === "savedSearch.escalating" && alert.condition?.kind === "savedSearch.escalating") {
    // "sustained for at least X" keeps the window distinct from the baseline period.
    return `Opens an incident when ${subject} are ${formatThreshold(alert.condition.threshold)}, sustained for at least ${formatWindowMinutes(
      alert.condition.window.minutes,
    )}.`
  }

  if (alert.kind === "event.matched") {
    return `Opens an incident each time a new matching event is detected for ${targetSubject(context)}.`
  }

  if (alert.kind === "metric.threshold" && alert.condition?.kind === "metric.threshold") {
    return `Opens an incident when ${formatMetricSubject(alert.condition.metric, context)} is ${formatMetricThreshold(alert.condition.threshold, alert.condition.metric, alert.condition.direction)}.`
  }

  if (alert.kind === "metric.escalating" && alert.condition?.kind === "metric.escalating") {
    return `Opens an incident when ${formatMetricSubject(alert.condition.metric, context)} is ${formatMetricThreshold(
      alert.condition.threshold,
      alert.condition.metric,
      alert.condition.direction,
    )}, sustained for at least ${formatWindowMinutes(alert.condition.window.minutes)}.`
  }

  // Defensive fallback for a malformed row (condition kind not matching alert kind).
  return `Monitor configured (${alert.kind}).`
}
