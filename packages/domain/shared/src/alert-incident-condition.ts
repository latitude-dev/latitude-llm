import { z } from "zod"

/** A positive duration in whole minutes, hours or days. */
export const alertDurationSchema = z.discriminatedUnion("unit", [
  z.object({ unit: z.literal("minutes"), minutes: z.number().positive() }),
  z.object({ unit: z.literal("hours"), hours: z.number().positive() }),
  z.object({ unit: z.literal("days"), days: z.number().positive() }),
])
export type AlertDuration = z.infer<typeof alertDurationSchema>

/** Seasonal-detector sensitivity `k` (σ multiplier). 1–6, lower = noisier. Shared with `issue.escalating`. */
export const escalationSensitivitySchema = z.number().int().min(1).max(6)

/** Provisioned default for `sensitivity`. Single source of truth — `@domain/issues` re-exports it as `DEFAULT_ESCALATION_SENSITIVITY_K`. */
export const DEFAULT_ESCALATION_SENSITIVITY = 3

/**
 * Fixed-window baseline for `multiplier` mode. `average` is the rolling rate over
 * `[now - lookback, now]`; `period` is the equal-length window just before now
 * (`[now - 2×lookback, now - lookback]`, e.g. `{ days: 1 }` = yesterday). The
 * dynamic "expected" baseline lives on `AlertCountThreshold` instead — it takes a
 * `sensitivity`, not a `factor`.
 */
export const alertBaselineSchema = z.object({
  kind: z.enum(["average", "period"]),
  lookback: alertDurationSchema,
})
export type AlertBaseline = z.infer<typeof alertBaselineSchema>

/**
 * `absolute` — fixed count. `multiplier` — `factor × baseline` (a fixed window,
 * normalised to the current window). `expected` — vs the seasonally-learned
 * expectation via `evaluateSeasonalEscalation` (same detector as
 * `issue.escalating`); its only knob is `sensitivity`, shown to users as the
 * "N times more than expected" amount.
 */
export const alertCountThresholdSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("absolute"), count: z.number().int().positive() }),
  z.object({ mode: z.literal("multiplier"), factor: z.number().positive(), baseline: alertBaselineSchema }),
  z.object({ mode: z.literal("expected"), sensitivity: escalationSensitivitySchema.optional() }),
])
export type AlertCountThreshold = z.infer<typeof alertCountThresholdSchema>

export const alertIncidentSavedSearchThresholdConditionSchema = z.object({
  kind: z.literal("savedSearch.threshold"),
  threshold: alertCountThresholdSchema,
})
export type AlertIncidentSavedSearchThresholdCondition = z.infer<
  typeof alertIncidentSavedSearchThresholdConditionSchema
>

/**
 * `window` is the sustained duration the threshold must stay crossed for before
 * the incident opens: the threshold is evaluated per internal sub-bucket tiling
 * the window and must hold across it (up to a small configurable failing-bucket
 * tolerance) to open; the incident closes once failing buckets exceed that
 * tolerance. Min 5 min (the firing throttle).
 */
export const alertIncidentSavedSearchEscalatingConditionSchema = z.object({
  kind: z.literal("savedSearch.escalating"),
  threshold: alertCountThresholdSchema,
  window: z.object({ minutes: z.number().int().min(5) }),
})
export type AlertIncidentSavedSearchEscalatingCondition = z.infer<
  typeof alertIncidentSavedSearchEscalatingConditionSchema
>

/** Sensitivity travels with the monitor (not project settings); system monitor provisions a default. */
export const alertIncidentIssueEscalatingConditionSchema = z.object({
  kind: z.literal("issue.escalating"),
  sensitivity: escalationSensitivitySchema.optional(),
})
export type AlertIncidentIssueEscalatingCondition = z.infer<typeof alertIncidentIssueEscalatingConditionSchema>

/**
 * What a query-time monitor measures over its target's matched rows. `count`
 * (the default) is one per matched entity; `errorRate` is `errored / total`;
 * `avg`/`p95`/`sum` aggregate a numeric field. The membership/threshold cutoff
 * is the alert condition, not part of the metric.
 */
export const MONITOR_METRIC_FIELDS = ["duration", "cost", "tokens"] as const
export const monitorMetricFieldSchema = z.enum(MONITOR_METRIC_FIELDS)
export type MonitorMetricField = z.infer<typeof monitorMetricFieldSchema>

export const monitorMetricSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("count") }),
  z.object({ kind: z.literal("errorRate") }),
  z.object({ kind: z.literal("avg"), field: monitorMetricFieldSchema }),
  z.object({ kind: z.literal("p95"), field: monitorMetricFieldSchema }),
  z.object({ kind: z.literal("sum"), field: monitorMetricFieldSchema }),
])
export type MonitorMetric = z.infer<typeof monitorMetricSchema>

/**
 * Threshold for the UNIFIED `metric.*` kinds. Same modes as the legacy
 * {@link alertCountThresholdSchema}, but `absolute` takes a float `value` (not an
 * int `count`) — error-rate (0.1), p95 latency, cost, etc. aren't whole numbers.
 */
export const alertMetricThresholdDirectionSchema = z.enum(["above", "below"])
export type AlertMetricThresholdDirection = z.infer<typeof alertMetricThresholdDirectionSchema>

export const alertMetricThresholdSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("absolute"), value: z.number().positive() }),
  z.object({ mode: z.literal("multiplier"), factor: z.number().positive(), baseline: alertBaselineSchema }),
  z.object({ mode: z.literal("expected"), sensitivity: escalationSensitivitySchema.optional() }),
])
export type AlertMetricThreshold = z.infer<typeof alertMetricThresholdSchema>

/** UNIFIED point alert: the monitor's metric crosses a threshold. (Target lives on the monitor.) */
export const alertIncidentMetricThresholdConditionSchema = z.object({
  kind: z.literal("metric.threshold"),
  metric: monitorMetricSchema,
  threshold: alertMetricThresholdSchema,
  direction: alertMetricThresholdDirectionSchema.optional(),
})
export type AlertIncidentMetricThresholdCondition = z.infer<typeof alertIncidentMetricThresholdConditionSchema>

/** UNIFIED sustained alert: the metric stays over threshold across `window` (see saved-search escalating semantics). */
export const alertIncidentMetricEscalatingConditionSchema = z.object({
  kind: z.literal("metric.escalating"),
  metric: monitorMetricSchema,
  threshold: alertMetricThresholdSchema,
  direction: alertMetricThresholdDirectionSchema.optional(),
  window: z.object({ minutes: z.number().int().min(5) }),
})
export type AlertIncidentMetricEscalatingCondition = z.infer<typeof alertIncidentMetricEscalatingConditionSchema>

/**
 * Per-kind alert config; `null` for kinds with no parameters (`issue.new`,
 * `issue.regressed`, `savedSearch.match`, `event.matched`).
 */
export const alertIncidentConditionSchema = z.discriminatedUnion("kind", [
  alertIncidentSavedSearchThresholdConditionSchema,
  alertIncidentSavedSearchEscalatingConditionSchema,
  alertIncidentIssueEscalatingConditionSchema,
  alertIncidentMetricThresholdConditionSchema,
  alertIncidentMetricEscalatingConditionSchema,
])
export type AlertIncidentCondition = z.infer<typeof alertIncidentConditionSchema>
