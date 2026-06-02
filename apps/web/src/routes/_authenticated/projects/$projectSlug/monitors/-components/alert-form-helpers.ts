import { formatHumanReadableAlert } from "@domain/monitors/helpers"
import {
  type AlertBaseline,
  type AlertCountThreshold,
  type AlertDuration,
  type AlertIncidentCondition,
  type AlertSeverity,
  SEVERITY_FOR_KIND,
} from "@domain/shared"
import type { MonitorAlertDraft } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorAlertRecord } from "../../../../../../domains/monitors/monitors.functions.ts"

/** Kinds a user may put on their own monitor (all saved-search-scoped today). */
export type UserAlertKind = "savedSearch.match" | "savedSearch.threshold" | "savedSearch.escalating"
export type ComparisonMode = "times" | "timesMoreThan"
export type WindowUnit = "minutes" | "hours" | "days"
/** `average`/`period` carry a `lookback`; `expected` is the dynamically-learned baseline (no window). */
export type BaselineKind = "average" | "period" | "expected"
export type LookbackUnit = "hours" | "days"

export const USER_ALERT_KINDS: readonly UserAlertKind[] = [
  "savedSearch.match",
  "savedSearch.threshold",
  "savedSearch.escalating",
]

export const USER_ALERT_KIND_LABEL: Record<UserAlertKind, string> = {
  "savedSearch.match": "Search match",
  "savedSearch.threshold": "Search threshold",
  "savedSearch.escalating": "Search escalating",
}

/**
 * Flat, UI-only working state for one alert card. Captures every control so
 * switching modes keeps sensible values; `draftTo*` collapse it back onto the
 * `AlertIncidentCondition` discriminated union the backend stores.
 */
export interface AlertDraft {
  readonly kind: UserAlertKind
  readonly sourceId: string | null
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

const draftToThreshold = (draft: AlertDraft): AlertCountThreshold => {
  if (draft.comparison === "times") return { mode: "absolute", count: draft.amount }
  if (draft.baselineKind === "expected") return { mode: "expected", sensitivity: draft.amount }
  const baseline: AlertBaseline = {
    kind: draft.baselineKind,
    lookback: lookbackToDuration(draft.lookbackAmount, draft.lookbackUnit),
  }
  return { mode: "multiplier", factor: draft.amount, baseline }
}

export const draftToCondition = (draft: AlertDraft): AlertIncidentCondition | null => {
  if (draft.kind === "savedSearch.match") return null
  const threshold = draftToThreshold(draft)
  if (draft.kind === "savedSearch.threshold") return { kind: "savedSearch.threshold", threshold }
  return {
    kind: "savedSearch.escalating",
    threshold,
    window: { minutes: windowToMinutes(draft.windowAmount, draft.windowUnit) },
  }
}

export const draftToAlertDraft = (draft: AlertDraft): MonitorAlertDraft => ({
  kind: draft.kind,
  source: { type: "savedSearch", id: draft.sourceId },
  condition: draftToCondition(draft),
  severity: draft.severity,
})

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

/** Hydrate the working draft from a persisted saved-search alert (panel editing). */
export const recordToAlertDraft = (alert: MonitorAlertRecord): AlertDraft => {
  const base = emptyAlertDraft({
    kind: alert.kind as UserAlertKind,
    sourceId: alert.source.id,
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
  return base
}

type FormatAlertArg = Parameters<typeof formatHumanReadableAlert>[0]

/** One-line live preview of the draft, via the shared domain formatter. */
export const previewAlertSentence = (draft: AlertDraft, savedSearchName?: string): string =>
  formatHumanReadableAlert(
    {
      id: "preview",
      monitorId: "preview",
      kind: draft.kind,
      source: { type: "savedSearch", id: draft.sourceId },
      condition: draftToCondition(draft),
      severity: draft.severity,
      createdAt: new Date(),
    } as FormatAlertArg,
    savedSearchName ? { savedSearchName } : undefined,
  )
