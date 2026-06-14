import type { MonitorTarget } from "@domain/monitors"
import { formatHumanReadableAlert } from "@domain/monitors/helpers"
import {
  type AlertBaseline,
  type AlertCountThreshold,
  type AlertDuration,
  type AlertIncidentCondition,
  type AlertMetricThreshold,
  type AlertSeverity,
  type MonitorMetric,
  SEVERITY_FOR_KIND,
} from "@domain/shared"
import { monitorTargetName } from "../../../../../../domains/monitors/monitor-target.ts"
import type { MonitorAlertDraft } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorAlertRecord } from "../../../../../../domains/monitors/monitors.functions.ts"

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
  | "event.matched"
  | "metric.threshold"
  | "metric.escalating"
export type ComparisonMode = "times" | "timesMoreThan"
export type WindowUnit = "minutes" | "hours" | "days"
/** `average`/`period` carry a `lookback`; `expected` is the dynamically-learned baseline (no window). */
export type BaselineKind = "average" | "period" | "expected"
export type LookbackUnit = "hours" | "days"

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
  readonly comparison: ComparisonMode
  /** count (absolute) · factor (multiplier) · sensitivity (expected) — see `comparison`/`baselineKind`. */
  readonly amount: number
  readonly baselineKind: BaselineKind
  /** Lookback window for `average`/`period` baselines (ignored for `expected`). */
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
  severity: SEVERITY_FOR_KIND["savedSearch.match"],
  comparison: "times",
  amount: 100,
  baselineKind: "average",
  lookbackAmount: 7,
  lookbackUnit: "days",
  windowAmount: 5,
  windowUnit: "minutes",
  ...overrides,
})

/**
 * Seed a draft for an in-context (tool/user) monitor: a unified target, the
 * `metric.threshold` tab pre-selected, and a small default threshold. The metric
 * selector edits `metric` (mirrored onto the target on submit).
 */
export const targetAlertDraft = (target: MonitorTarget, overrides?: Partial<AlertDraft>): AlertDraft =>
  emptyAlertDraft({
    kind: "metric.threshold",
    target,
    metric: target.metric,
    severity: SEVERITY_FOR_KIND["metric.threshold"],
    comparison: "times",
    amount: 1,
    ...overrides,
  })

/** The three kinds (match/threshold/escalating order) available for a draft's mode. */
export const kindsForDraft = (draft: AlertDraft): readonly [UserAlertKind, UserAlertKind, UserAlertKind] =>
  draft.target === null
    ? ["savedSearch.match", "savedSearch.threshold", "savedSearch.escalating"]
    : ["event.matched", "metric.threshold", "metric.escalating"]

/** Switch kind within the current mode, resetting threshold/window fields but keeping target/metric/source/severity. */
export const draftWithKind = (draft: AlertDraft, kind: UserAlertKind): AlertDraft =>
  emptyAlertDraft({
    kind,
    sourceId: draft.sourceId,
    target: draft.target,
    metric: draft.metric,
    severity: draft.severity,
  })

export interface AlertFieldErrors {
  readonly source?: readonly string[]
  readonly threshold?: readonly string[]
  readonly window?: readonly string[]
}

export const hasAlertFieldErrors = (errors: AlertFieldErrors): boolean =>
  Boolean(errors.source?.length || errors.threshold?.length || errors.window?.length)

/** Project a server Zod field-error map onto one alert's fields; pass `index` for the create modal's `alerts.N.…` paths, `null` for the single-alert modal. */
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
    const rel = path.slice(prefix.length)
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
  unit === "hours" ? { unit: "hours", hours: amount } : { unit: "days", days: amount }

const durationToLookback = (duration: AlertDuration): { amount: number; unit: LookbackUnit } =>
  duration.unit === "hours" ? { amount: duration.hours, unit: "hours" } : { amount: duration.days, unit: "days" }

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
const draftToCountThreshold = (draft: AlertDraft): AlertCountThreshold => {
  if (draft.comparison === "times") return { mode: "absolute", count: draft.amount }
  if (draft.baselineKind === "expected") return { mode: "expected", sensitivity: draft.amount }
  return { mode: "multiplier", factor: draft.amount, baseline: draftBaseline(draft) }
}

/** Unified metric threshold: absolute is a float `value` (error rate, latency, cost…). */
const draftToMetricThreshold = (draft: AlertDraft): AlertMetricThreshold => {
  if (draft.comparison === "times") return { mode: "absolute", value: draft.amount }
  if (draft.baselineKind === "expected") return { mode: "expected", sensitivity: draft.amount }
  return { mode: "multiplier", factor: draft.amount, baseline: draftBaseline(draft) }
}

export const draftToCondition = (draft: AlertDraft): AlertIncidentCondition | null => {
  const window = { minutes: windowToMinutes(draft.windowAmount, draft.windowUnit) }
  if (draft.target !== null) {
    if (draft.kind === "event.matched") return null
    const threshold = draftToMetricThreshold(draft)
    if (draft.kind === "metric.threshold") return { kind: "metric.threshold", metric: draft.metric, threshold }
    return { kind: "metric.escalating", metric: draft.metric, threshold, window }
  }
  if (draft.kind === "savedSearch.match") return null
  const threshold = draftToCountThreshold(draft)
  if (draft.kind === "savedSearch.threshold") return { kind: "savedSearch.threshold", threshold }
  return { kind: "savedSearch.escalating", threshold, window }
}

export const draftToAlertDraft = (draft: AlertDraft): MonitorAlertDraft => ({
  kind: draft.kind,
  source: draft.target !== null ? null : { type: "savedSearch", id: draft.sourceId },
  condition: draftToCondition(draft),
  severity: draft.severity,
})

/** The monitor-level target to submit, with the metric selector's choice mirrored onto it (the firing path reads `target.metric`). */
export const draftToTarget = (draft: AlertDraft): MonitorTarget | undefined =>
  draft.target !== null ? { ...draft.target, metric: draft.metric } : undefined

const thresholdToDraftFields = (
  threshold: AlertCountThreshold,
): Pick<AlertDraft, "comparison" | "amount" | "baselineKind" | "lookbackAmount" | "lookbackUnit"> => {
  if (threshold.mode === "absolute") {
    return {
      comparison: "times",
      amount: threshold.count,
      baselineKind: "average",
      lookbackAmount: 7,
      lookbackUnit: "days",
    }
  }
  if (threshold.mode === "multiplier") {
    const lookback = durationToLookback(threshold.baseline.lookback)
    return {
      comparison: "timesMoreThan",
      amount: threshold.factor,
      baselineKind: threshold.baseline.kind,
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

/** `value` instead of `count` for unified metric thresholds (otherwise identical mode handling). */
const metricThresholdToDraftFields = (
  threshold: AlertMetricThreshold,
): Pick<AlertDraft, "comparison" | "amount" | "baselineKind" | "lookbackAmount" | "lookbackUnit"> => {
  if (threshold.mode === "absolute") {
    return {
      comparison: "times",
      amount: threshold.value,
      baselineKind: "average",
      lookbackAmount: 7,
      lookbackUnit: "days",
    }
  }
  if (threshold.mode === "multiplier") {
    const lookback = durationToLookback(threshold.baseline.lookback)
    return {
      comparison: "timesMoreThan",
      amount: threshold.factor,
      baselineKind: threshold.baseline.kind,
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
export const recordToAlertDraft = (alert: MonitorAlertRecord, target?: MonitorTarget | null): AlertDraft => {
  const base = emptyAlertDraft({
    kind: alert.kind as UserAlertKind,
    sourceId: alert.source?.id ?? null,
    ...(target ? { target, metric: target.metric } : {}),
    severity: alert.severity,
  })
  const condition = alert.condition
  if (condition?.kind === "savedSearch.threshold") {
    return { ...base, ...thresholdToDraftFields(condition.threshold) }
  }
  if (condition?.kind === "savedSearch.escalating") {
    const window = minutesToWindow(condition.window.minutes)
    return {
      ...base,
      ...thresholdToDraftFields(condition.threshold),
      windowAmount: window.amount,
      windowUnit: window.unit,
    }
  }
  if (condition?.kind === "metric.threshold") {
    return { ...base, metric: condition.metric, ...metricThresholdToDraftFields(condition.threshold) }
  }
  if (condition?.kind === "metric.escalating") {
    const window = minutesToWindow(condition.window.minutes)
    return {
      ...base,
      metric: condition.metric,
      ...metricThresholdToDraftFields(condition.threshold),
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
    } as FormatAlertArg,
    context,
  )
}
