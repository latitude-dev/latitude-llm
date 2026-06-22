import type { MonitorMetric } from "./alert-incident-condition.ts"

/**
 * Display units for a monitor metric's threshold. The firing path compares the
 * threshold against the raw ClickHouse aggregate, whose unit is NOT what a user
 * thinks in: duration is nanoseconds, cost is microcents, error rate is a 0–1
 * fraction. These helpers convert between the stored value and the user-facing
 * unit, and are the single source of truth shared by the create form and the
 * human-readable sentence (notifications, panel, preview).
 */
export type MetricUnit = "%" | "s" | "$" | "tokens" | "count"

const DURATION_NS_PER_SECOND = 1_000_000_000
const MICROCENTS_PER_DOLLAR = 100_000_000
const ERROR_RATE_PER_PERCENT = 100

export const metricUnit = (metric: MonitorMetric): MetricUnit => {
  if (metric.kind === "errorRate") return "%"
  if (metric.kind === "count") return "count"
  switch (metric.field) {
    case "duration":
      return "s"
    case "cost":
      return "$"
    case "tokens":
      return "tokens"
  }
}

/** User-entered display value → the stored value the firing path compares. */
export const metricValueToStored = (displayValue: number, metric: MonitorMetric): number => {
  switch (metricUnit(metric)) {
    case "%":
      return displayValue / ERROR_RATE_PER_PERCENT
    case "s":
      return displayValue * DURATION_NS_PER_SECOND
    case "$":
      return displayValue * MICROCENTS_PER_DOLLAR
    default:
      return displayValue
  }
}

/** Stored value → the display value to show in the form. */
export const metricValueFromStored = (storedValue: number, metric: MonitorMetric): number => {
  switch (metricUnit(metric)) {
    case "%":
      return storedValue * ERROR_RATE_PER_PERCENT
    case "s":
      return storedValue / DURATION_NS_PER_SECOND
    case "$":
      return storedValue / MICROCENTS_PER_DOLLAR
    default:
      return storedValue
  }
}

const trimNumber = (value: number, maxFractionDigits: number): string =>
  Number(value.toFixed(maxFractionDigits)).toString()

/** Format a stored threshold value with its unit ("5%", "0.5s", "$10", "100", "5000 tokens"). */
export const formatMetricValue = (storedValue: number, metric: MonitorMetric): string => {
  const display = metricValueFromStored(storedValue, metric)
  switch (metricUnit(metric)) {
    case "%":
      return `${trimNumber(display, 2)}%`
    case "s":
      return `${trimNumber(display, 2)}s`
    case "$":
      return `$${trimNumber(display, 2)}`
    case "tokens":
      return `${trimNumber(display, 0)} tokens`
    case "count":
      return trimNumber(display, 2)
  }
}
