import type { MonitorTarget } from "@domain/monitors"
import { formatHumanReadableAlert } from "@domain/monitors/helpers"
import {
  type AlertBaseline,
  type AlertDuration,
  type AlertIncidentCondition,
  type AlertMetricThreshold,
  type AlertMetricThresholdDirection,
  type AlertSeverity,
  type MonitorMetric,
  metricValueFromStored,
  metricValueToStored,
} from "@domain/shared"
import { monitorTargetName } from "../../../../../../domains/monitors/monitor-target.ts"
import type { MonitorRuleDraft } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorRuleRecord } from "../../../../../../domains/monitors/monitors.functions.ts"

/**
 * Kinds a user may put on their own monitor. The saved-search trio targets a
 * saved search (source on the alert); the unified trio targets the monitor's
 * `(stream, filterSet, metric)` (target on the monitor) — same three tabs
 * (match / threshold / escalating), selected by whether the draft has a target.
 */
export type UserAlertKind =
  | "savedSearch.match"
  | "savedSearch.threshold"
  | "savedSearch.escalating"
  | "monitor.match"
  | "monitor.threshold"
  | "monitor.escalating"
export type ComparisonMode = "times" | "timesMoreThan"
export type WindowUnit = "minutes" | "hours" | "days"
export type MetricDirection = AlertMetricThresholdDirection
/** `period` carries a `lookback`; `expected` is the dynamically-learned baseline (no window). */
export type BaselineKind = "period" | "expected"
export type LookbackUnit = "minutes" | "hours" | "days"

/**
 * Flat, UI-only working state for one alert card. Captures every control so
 * switching modes keeps sensible values; `draftTo*` collapse it back onto the
 * `AlertIncidentCondition` discriminated union the backend stores.
 */
export interface AlertDraft {
  readonly kind: UserAlertKind
  readonly sourceId: string | null
  /** Unified target ({stream, filterSet, query, metric}); null = saved-search mode. */
  readonly target: MonitorTarget | null
  /** The aggregate measured for unified targets; ignored in saved-search mode. */
  readonly metric: MonitorMetric
  readonly severity: AlertSeverity
  readonly direction: MetricDirection
  readonly comparison: ComparisonMode
  /** count (absolute) · factor (multiplier) · sensitivity (expected) — see `comparison`/`baselineKind`. */
  readonly amount: number
  readonly baselineKind: BaselineKind
  /** Lookback window for `period` baselines (ignored for `expected`). */
  readonly lookbackAmount: number
  readonly lookbackUnit: LookbackUnit
  readonly windowAmount: number
  readonly windowUnit: WindowUnit
}

export const emptyAlertDraft = (overrides?: Partial<AlertDraft>): AlertDraft => ({
  kind: "savedSearch.match",
  sourceId: null,
  target: null,
  metric: { kind: "count" },
  severity: "medium",
  direction: "above",
  comparison: "times",
  amount: 100,
  baselineKind: "period",
  lookbackAmount: 7,
  lookbackUnit: "days",
  windowAmount: 5,
  windowUnit: "minutes",
  ...overrides,
})

/**
 * Seed a draft for an in-context (tool/user) monitor: a unified target, the
 * `monitor.threshold` tab pre-selected, and a small default threshold. The metric
 * selector edits `metric` (mirrored onto the target on submit).
 */
export const targetAlertDraft = (target: MonitorTarget, overrides?: Partial<AlertDraft>): AlertDraft =>
  emptyAlertDraft({
    kind: "monitor.threshold",
    target,
    metric: target.metric,
    severity: "medium",
    comparison: "times",
    amount: 1,
    ...overrides,
  })

/**
 * Tabs available for a draft's mode. Both saved-search and target monitors can
 * fire on match, threshold, or escalation; match monitors do not use metric controls.
 */
export const kindsForDraft = (draft: AlertDraft): readonly UserAlertKind[] =>
  draft.target === null
    ? ["savedSearch.match", "savedSearch.threshold", "savedSearch.escalating"]
    : ["monitor.match", "monitor.threshold", "monitor.escalating"]

/** Switch kind within the current mode, resetting threshold/window fields but keeping target/metric/source/severity. */
export const draftWithKind = (draft: AlertDraft, kind: UserAlertKind): AlertDraft =>
  emptyAlertDraft({
    kind,
    sourceId: draft.sourceId,
    target: draft.target,
    metric: draft.metric,
    severity: draft.severity,
    direction: draft.direction,
  })

export interface AlertFieldErrors {
  readonly source?: readonly string[]
  readonly threshold?: readonly string[]
  readonly window?: readonly string[]
}

export const hasAlertFieldErrors = (errors: AlertFieldErrors): boolean =>
  Boolean(errors.source?.length || errors.threshold?.length || errors.window?.length)

/** Project a server Zod field-error map onto one monitor rule's fields. */
export const alertFieldErrorsFrom = (
  fieldErrors: Record<string, string[]> | null,
  index: number | null,
): AlertFieldErrors => {
  if (!fieldErrors) return {}
  const prefix = index === null ? "" : `alerts.${index}.`
  const source: string[] = []
  const threshold: string[] = []
  const window: string[] = []
  for (const [path, messages] of Object.entries(fieldErrors)) {
    if (prefix && !path.startsWith(prefix)) continue
    const rel = path.slice(prefix.length).replace(/^rule\./, "")
    if (rel.startsWith("source")) source.push(...messages)
    else if (rel.startsWith("condition.window")) window.push(...messages)
    else if (rel.startsWith("condition.threshold")) threshold.push(...messages)
  }
  return {
    ...(source.length ? { source } : {}),
    ...(threshold.length ? { threshold } : {}),
    ...(window.length ? { window } : {}),
  }
}

const lookbackToDuration = (amount: number, unit: LookbackUnit): AlertDuration =>
  unit === "minutes"
    ? { unit: "minutes", minutes: amount }
    : unit === "hours"
      ? { unit: "hours", hours: amount }
      : { unit: "days", days: amount }

const durationToLookback = (duration: AlertDuration): { amount: number; unit: LookbackUnit } => {
  if (duration.unit === "minutes") return { amount: duration.minutes, unit: "minutes" }
  if (duration.unit === "hours") return { amount: duration.hours, unit: "hours" }
  return { amount: duration.days, unit: "days" }
}

const windowToMinutes = (amount: number, unit: WindowUnit): number =>
  unit === "minutes" ? amount : unit === "hours" ? amount * 60 : amount * 1440

const minutesToWindow = (minutes: number): { amount: number; unit: WindowUnit } => {
  if (minutes % 1440 === 0) return { amount: minutes / 1440, unit: "days" }
  if (minutes % 60 === 0) return { amount: minutes / 60, unit: "hours" }
  return { amount: minutes, unit: "minutes" }
}

const draftBaseline = (draft: AlertDraft): AlertBaseline => ({
  kind: draft.baselineKind === "expected" ? "average" : draft.baselineKind,
  lookback: lookbackToDuration(draft.lookbackAmount, draft.lookbackUnit),
})

/** Saved-search threshold: absolute is an integer count. */
const draftToCountThreshold = (draft: AlertDraft): AlertMetricThreshold => {
  if (draft.comparison === "times") return { mode: "absolute", value: draft.amount }
  if (draft.baselineKind === "expected") return { mode: "expected", sensitivity: draft.amount }
  return { mode: "multiplier", factor: draft.amount, baseline: draftBaseline(draft) }
}

/** Unified metric threshold: absolute is a float `value` in the metric's stored unit (ns/microcents/fraction). */
const draftToMetricThreshold = (draft: AlertDraft): AlertMetricThreshold => {
  if (draft.comparison === "times") return { mode: "absolute", value: metricValueToStored(draft.amount, draft.metric) }
  if (draft.baselineKind === "expected") return { mode: "expected", sensitivity: draft.amount }
  return { mode: "multiplier", factor: draft.amount, baseline: draftBaseline(draft) }
}

export const draftToCondition = (draft: AlertDraft): AlertIncidentCondition | null => {
  const window = { minutes: windowToMinutes(draft.windowAmount, draft.windowUnit) }
  if (draft.target !== null) {
    if (draft.kind === "monitor.match") return null
    const threshold = draftToMetricThreshold(draft)
    if (draft.kind === "monitor.threshold") {
      return { trigger: "threshold", metric: draft.metric, threshold, direction: draft.direction }
    }
    return { trigger: "escalating", metric: draft.metric, threshold, direction: draft.direction, window }
  }
  if (draft.kind === "savedSearch.match") return null
  const threshold = draftToCountThreshold(draft)
  if (draft.kind === "savedSearch.threshold") return { trigger: "threshold", metric: { kind: "count" }, threshold }
  return { trigger: "escalating", metric: { kind: "count" }, threshold, window }
}

export const draftToAlertDraft = (draft: AlertDraft): MonitorRuleDraft => ({
  kind: draft.kind,
  source: draft.target !== null ? null : { type: "savedSearch", id: draft.sourceId },
  condition: draftToCondition(draft),
  severity: draft.severity,
})

/** The monitor-level target to submit, with the metric selector's choice mirrored onto it (the firing path reads `target.metric`). */
export const draftToTarget = (draft: AlertDraft): MonitorTarget | undefined =>
  draft.target !== null ? { ...draft.target, metric: draft.metric } : undefined

const thresholdToDraftFields = (
  threshold: AlertMetricThreshold,
): Pick<AlertDraft, "comparison" | "amount" | "baselineKind" | "lookbackAmount" | "lookbackUnit"> => {
  if (threshold.mode === "absolute") {
    return {
      comparison: "times",
      amount: threshold.value,
      baselineKind: "period",
      lookbackAmount: 7,
      lookbackUnit: "days",
    }
  }
  if (threshold.mode === "multiplier") {
    const lookback = durationToLookback(threshold.baseline.lookback)
    return {
      comparison: "timesMoreThan",
      amount: threshold.factor,
      baselineKind: "period",
      lookbackAmount: lookback.amount,
      lookbackUnit: lookback.unit,
    }
  }
  return {
    comparison: "timesMoreThan",
    amount: threshold.sensitivity ?? 3,
    baselineKind: "expected",
    lookbackAmount: 7,
    lookbackUnit: "days",
  }
}

/** `value` (in the metric's display unit) instead of `count` for unified metric thresholds. */
const metricThresholdToDraftFields = (
  threshold: AlertMetricThreshold,
  metric: MonitorMetric,
): Pick<AlertDraft, "comparison" | "amount" | "baselineKind" | "lookbackAmount" | "lookbackUnit"> => {
  if (threshold.mode === "absolute") {
    return {
      comparison: "times",
      amount: metricValueFromStored(threshold.value, metric),
      baselineKind: "period",
      lookbackAmount: 7,
      lookbackUnit: "days",
    }
  }
  if (threshold.mode === "multiplier") {
    const lookback = durationToLookback(threshold.baseline.lookback)
    return {
      comparison: "timesMoreThan",
      amount: threshold.factor,
      baselineKind: "period",
      lookbackAmount: lookback.amount,
      lookbackUnit: lookback.unit,
    }
  }
  return {
    comparison: "timesMoreThan",
    amount: threshold.sensitivity ?? 3,
    baselineKind: "expected",
    lookbackAmount: 7,
    lookbackUnit: "days",
  }
}

/**
 * Hydrate the working draft from a persisted alert for panel editing. Pass the
 * monitor's `target` for unified `event.*`/`metric.*` alerts so the form opens in
 * target mode (metric + read-only target chip); omit it for saved-search alerts.
 */
export const recordToAlertDraft = (alert: MonitorRuleRecord, target?: MonitorTarget | null): AlertDraft => {
  const base = emptyAlertDraft({
    kind: alert.kind,
    sourceId: alert.source?.id ?? null,
    ...(target ? { target, metric: target.metric } : {}),
    severity: alert.severity,
  })
  const condition = alert.condition
  if (condition?.trigger === "threshold" && alert.kind === "monitor.threshold" && target === undefined) {
    return { ...base, ...thresholdToDraftFields(condition.threshold) }
  }
  if (condition?.trigger === "escalating" && alert.kind === "monitor.escalating" && target === undefined) {
    const window = minutesToWindow(condition.window?.minutes ?? 5)
    return {
      ...base,
      ...thresholdToDraftFields(condition.threshold ?? { mode: "expected" }),
      windowAmount: window.amount,
      windowUnit: window.unit,
    }
  }
  if (condition?.trigger === "threshold") {
    return {
      ...base,
      metric: condition.metric,
      direction: condition.direction ?? "above",
      ...metricThresholdToDraftFields(condition.threshold, condition.metric),
    }
  }
  if (condition?.trigger === "escalating") {
    const window = minutesToWindow(condition.window?.minutes ?? 5)
    return {
      ...base,
      metric: condition.metric,
      direction: condition.direction ?? "above",
      ...metricThresholdToDraftFields(condition.threshold ?? { mode: "expected" }, condition.metric),
      windowAmount: window.amount,
      windowUnit: window.unit,
    }
  }
  return base
}

type FormatAlertArg = Parameters<typeof formatHumanReadableAlert>[0]

/** One-line live preview of the draft, via the shared domain formatter. */
export const previewAlertSentence = (draft: AlertDraft, savedSearchName?: string): string => {
  const targetName = draft.target !== null ? monitorTargetName(draft.target) : undefined
  const context =
    draft.target !== null
      ? targetName
        ? { targetName }
        : undefined
      : savedSearchName
        ? { savedSearchName }
        : undefined
  return formatHumanReadableAlert(
    {
      id: "preview",
      monitorId: "preview",
      kind: draft.kind,
      source: draft.target !== null ? null : { type: "savedSearch", id: draft.sourceId },
      condition: draftToCondition(draft),
      severity: draft.severity,
      createdAt: new Date(),
    } as unknown as FormatAlertArg,
    context,
  )
}
