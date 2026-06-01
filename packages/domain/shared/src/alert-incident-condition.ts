import { z } from "zod"

/** A positive duration in whole hours or days. */
export const alertDurationSchema = z.discriminatedUnion("unit", [
  z.object({ unit: z.literal("hours"), hours: z.number().positive() }),
  z.object({ unit: z.literal("days"), days: z.number().positive() }),
])
export type AlertDuration = z.infer<typeof alertDurationSchema>

/** Seasonal-detector sensitivity `k` (σ multiplier). 1–6, lower = noisier. Shared with `issue.escalating`. */
export const escalationSensitivitySchema = z.number().int().min(1).max(6)

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

/** `window` is both the rolling count window and the dwell-on-exit; min 5 min (the firing throttle). */
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

/** Per-kind alert config; `null` for kinds with no parameters (`issue.new`, `issue.regressed`, `savedSearch.match`). */
export const alertIncidentConditionSchema = z.discriminatedUnion("kind", [
  alertIncidentSavedSearchThresholdConditionSchema,
  alertIncidentSavedSearchEscalatingConditionSchema,
  alertIncidentIssueEscalatingConditionSchema,
])
export type AlertIncidentCondition = z.infer<typeof alertIncidentConditionSchema>
