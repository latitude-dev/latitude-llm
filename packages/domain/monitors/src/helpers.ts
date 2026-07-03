import {
  type AlertBaseline,
  type AlertDuration,
  type AlertIncidentCondition,
  type AlertMetricThreshold,
  formatMetricValue,
  type MonitorMetric,
  type MonitorTrigger,
} from "@domain/shared"

export interface HumanReadableRuleContext {
  readonly savedSearchName?: string
  readonly targetName?: string
}

export interface HumanReadableRuleInput {
  readonly trigger: MonitorTrigger
  readonly condition: AlertIncidentCondition | null | undefined
}

const formatDuration = (duration: AlertDuration): string => {
  if (duration.unit === "minutes")
    return duration.minutes === 1 ? "the last minute" : `the last ${duration.minutes} minutes`
  if (duration.unit === "hours") return duration.hours === 1 ? "the last hour" : `the last ${duration.hours} hours`
  return duration.days === 1 ? "the last day" : `the last ${duration.days} days`
}

const formatPreviousPeriod = (duration: AlertDuration): string => {
  if (duration.unit === "minutes")
    return duration.minutes === 1 ? "the previous minute" : `the previous ${duration.minutes} minutes`
  if (duration.unit === "hours")
    return duration.hours === 1 ? "the previous hour" : `the previous ${duration.hours} hours`
  if (duration.days === 1) return "yesterday"
  return duration.days === 7 ? "the previous week" : `the previous ${duration.days} days`
}

const formatMetricBaseline = (baseline: AlertBaseline): string =>
  baseline.kind === "average"
    ? `the same metric averaged over ${formatDuration(baseline.lookback)}`
    : `the same metric during ${formatPreviousPeriod(baseline.lookback)}`

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

const metricFieldNoun = (field: "duration" | "cost" | "tokens"): string =>
  field === "duration" ? "latency" : field === "tokens" ? "token count" : "cost"

const formatMetric = (metric: MonitorMetric): string => {
  switch (metric.kind) {
    case "count":
      return "the volume"
    case "errorRate":
      return "the error rate"
    case "cacheHitRate":
      return "the cache hit rate"
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
    case "percentile":
      return `the ${metric.p}th-percentile ${metricFieldNoun(metric.field)}`
  }
}

const targetSubject = (context?: HumanReadableRuleContext): string =>
  context?.targetName ?? context?.savedSearchName ?? "the target"

const formatMetricSubject = (metric: MonitorMetric, context?: HumanReadableRuleContext): string =>
  `${formatMetric(metric)} for ${targetSubject(context)}`

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

export function formatHumanReadableRule(rule: HumanReadableRuleInput, context?: HumanReadableRuleContext): string {
  if (rule.trigger === "match") {
    return `Opens an incident each time a new match is detected for ${targetSubject(context)}.`
  }

  if (rule.condition?.trigger === "threshold") {
    return `Opens an incident when ${formatMetricSubject(rule.condition.metric, context)} is ${formatMetricThreshold(
      rule.condition.threshold,
      rule.condition.metric,
      rule.condition.direction,
    )}.`
  }

  if (rule.condition?.trigger === "escalating") {
    const threshold = rule.condition.threshold
      ? ` is ${formatMetricThreshold(rule.condition.threshold, rule.condition.metric, rule.condition.direction)}`
      : " is escalating"
    const window = rule.condition.window
      ? `, sustained for at least ${formatWindowMinutes(rule.condition.window.minutes)}`
      : ""
    return `Opens an incident when ${formatMetricSubject(rule.condition.metric, context)}${threshold}${window}.`
  }

  return `Monitor configured for ${rule.trigger}.`
}

export function formatHumanReadableAlert(
  alert: { readonly kind?: string; readonly condition?: AlertIncidentCondition | null },
  context?: HumanReadableRuleContext,
): string {
  const trigger = alert.kind?.includes(".") ? (alert.kind.split(".")[1] as MonitorTrigger) : "escalating"
  return formatHumanReadableRule({ trigger, condition: alert.condition ?? null }, context)
}
