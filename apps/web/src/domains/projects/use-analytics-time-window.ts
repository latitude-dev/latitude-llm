import { useMountEffect } from "@repo/ui"
import { useCallback, useMemo } from "react"
import { useParamState } from "../../lib/hooks/useParamState.ts"
import { defaultProjectTimeWindowSeconds } from "./default-time-window.ts"

/**
 * Shared time-window logic for the analytics screens (Tools, Signals, Users) that store the range as
 * two URL params (`<prefix>TimeFrom` / `<prefix>TimeTo`) and feed a `{ fromIso, toIso }` range into
 * their queries. The default is "All time": untouched params mean no lower bound (a picked range
 * lives in the params, and clearing returns to All time). Screens whose endpoints require a concrete
 * lower bound pass `allTimeLowerBoundIso` (the project's earliest activity). The trend/histogram
 * range is clamped and anchored to the latest activity so All time never triggers an unbounded scan.
 */

/** List/aggregation range. `fromIso` omitted == unbounded lower bound ("All time"). */
interface AnalyticsListRange {
  readonly fromIso?: string
  readonly toIso: string
}

/** Trend/histogram range — always bounded (clamped + anchored). */
interface AnalyticsTrendRange {
  readonly fromIso: string
  readonly toIso: string
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in use-analytics-time-window.test.ts)
// ---------------------------------------------------------------------------

/** No lower bound picked — reads are "All time". */
export function isAllTimeRead(timeFrom: string): boolean {
  return timeFrom === ""
}

/**
 * The list range: the picked range, else "All time" (default). "All time" drops the lower bound
 * unless `allTimeLowerBoundIso` is given — screens whose endpoints require a concrete lower bound
 * pass the project's earliest activity, which captures all data without an unbounded scan param.
 */
export function resolveAnalyticsListRange(input: {
  readonly timeFrom: string
  readonly timeTo: string
  readonly nowMs: number
  readonly allTimeLowerBoundIso?: string | null | undefined
}): AnalyticsListRange {
  const { timeFrom, timeTo, nowMs, allTimeLowerBoundIso } = input
  // Bounds come from the URL and may be unparseable (hand-crafted); guard so `new Date(NaN).toISOString()`
  // can never throw. A bad upper bound falls back to `now`; a bad lower bound falls through to All time.
  const toMs = timeTo ? Date.parse(timeTo) : nowMs
  const toIso = new Date(Number.isFinite(toMs) ? toMs : nowMs).toISOString()
  if (timeFrom) {
    const fromMs = Date.parse(timeFrom)
    if (Number.isFinite(fromMs)) return { fromIso: new Date(fromMs).toISOString(), toIso }
  }
  return allTimeLowerBoundIso ? { fromIso: allTimeLowerBoundIso, toIso } : { toIso }
}

/** Clips a list range into the band the data covers. Without bounds it passes through; "All time" becomes the band. */
export function clipRangeToCoverage(input: {
  readonly range: AnalyticsListRange
  readonly coverageFromIso?: string | null | undefined
  readonly coverageToIso?: string | null | undefined
}): AnalyticsListRange {
  const { range, coverageFromIso, coverageToIso } = input
  const coverageFromMs = coverageFromIso ? Date.parse(coverageFromIso) : Number.NaN
  const coverageToMs = coverageToIso ? Date.parse(coverageToIso) : Number.NaN
  if (!Number.isFinite(coverageFromMs) || !Number.isFinite(coverageToMs)) return range
  const requestedFromMs = range.fromIso ? Date.parse(range.fromIso) : Number.NaN
  const requestedToMs = Date.parse(range.toIso)
  // Clamped at both ends: a coverage window that ends before now (data stopped) lets a
  // recent selection start past it, and a start outside the band would report a window
  // the picker says is unselectable.
  const requestedOrFromMs = Number.isFinite(requestedFromMs)
    ? Math.max(requestedFromMs, coverageFromMs)
    : coverageFromMs
  const fromMs = Math.min(requestedOrFromMs, coverageToMs)
  const toMs = Math.max(Math.min(Number.isFinite(requestedToMs) ? requestedToMs : coverageToMs, coverageToMs), fromMs)
  return { fromIso: new Date(fromMs).toISOString(), toIso: new Date(toMs).toISOString() }
}

/**
 * Clamps the trend/histogram window to `maxSpanSeconds`, anchored to the end. When All time, anchors
 * to `lastActivityIso` (latest data) so the chart isn't a blank "last N days from now".
 */
export function resolveAnalyticsTrendRange(input: {
  readonly listRange: AnalyticsListRange
  readonly isAllTime: boolean
  readonly lastActivityIso?: string | null | undefined
  readonly maxSpanSeconds: number
  readonly nowMs: number
}): AnalyticsTrendRange {
  const { listRange, isAllTime, lastActivityIso, maxSpanSeconds, nowMs } = input
  const maxSpanMs = maxSpanSeconds * 1000
  const anchorMs = isAllTime && lastActivityIso ? Date.parse(lastActivityIso) : Date.parse(listRange.toIso)
  const endMs = Number.isFinite(anchorMs) ? anchorMs : nowMs
  const desiredStartMs = !isAllTime && listRange.fromIso ? Date.parse(listRange.fromIso) : endMs - maxSpanMs
  const startMs = Math.max(desiredStartMs, endMs - maxSpanMs)
  return { fromIso: new Date(startMs).toISOString(), toIso: new Date(endMs).toISOString() }
}

/** Time-picker change → next `[timeFrom, timeTo]`. An empty selection clears back to "All time". */
export function applyAnalyticsTimeChange(from?: string, to?: string): readonly [string, string] {
  if (!from && !to) return ["", ""]
  return [from ?? "", to ?? ""]
}

/** Histogram brush selection → next `[timeFrom, timeTo]`. Clearing the brush (`null`) returns to All time. */
export function applyAnalyticsBrushSelect(range: { from: string; to: string } | null): readonly [string, string] {
  if (!range) return ["", ""]
  return [range.from, range.to]
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseAnalyticsTimeWindowInput {
  readonly project: { readonly isShowcase: boolean }
  readonly fromKey: string
  readonly toKey: string
  /** Latest activity ISO, used to anchor the trend when All time. */
  readonly lastActivityIso?: string | null
  /** Concrete lower bound for "All time" when the screen's endpoint needs one (e.g. `firstTraceAt`). */
  readonly allTimeLowerBoundIso?: string | null
  readonly trendMaxSpanSeconds?: number
  /**
   * The range the screen's data actually covers. Both bounds must be present to take effect; when
   * they are, every range this hook reports is clipped into them so a wider selection can never be
   * read as a wider answer.
   */
  readonly coverageFromIso?: string | null
  readonly coverageToIso?: string | null
}

interface AnalyticsTimeWindow {
  readonly timeFrom: string
  readonly timeTo: string
  readonly isAllTime: boolean
  /** A real user-picked bounded range (not the All-time default). */
  readonly hasExplicitRange: boolean
  readonly listRange: AnalyticsListRange
  readonly trendRange: AnalyticsTrendRange
  readonly pickerStartFrom: string | undefined
  readonly pickerStartTo: string | undefined
  readonly onTimeChange: (from?: string, to?: string) => void
  readonly onBrushSelect: (range: { from: string; to: string } | null) => void
}

export function useAnalyticsTimeWindow({
  project,
  fromKey,
  toKey,
  lastActivityIso,
  allTimeLowerBoundIso,
  trendMaxSpanSeconds,
  coverageFromIso,
  coverageToIso,
}: UseAnalyticsTimeWindowInput): AnalyticsTimeWindow {
  const [timeFrom, setTimeFrom] = useParamState(fromKey, "")
  const [timeTo, setTimeTo] = useParamState(toKey, "")
  const maxSpanSeconds = trendMaxSpanSeconds ?? defaultProjectTimeWindowSeconds(project)
  const isAllTime = isAllTimeRead(timeFrom)

  useMountEffect(() => {
    if (!project.isShowcase || timeFrom !== "" || timeTo !== "") return
    setTimeFrom(new Date(Date.now() - defaultProjectTimeWindowSeconds(project) * 1000).toISOString())
  })

  const { listRange, trendRange } = useMemo(() => {
    const nowMs = Date.now()
    const list = clipRangeToCoverage({
      range: resolveAnalyticsListRange({ timeFrom, timeTo, nowMs, allTimeLowerBoundIso }),
      coverageFromIso,
      coverageToIso,
    })
    return {
      listRange: list,
      trendRange: resolveAnalyticsTrendRange({ listRange: list, isAllTime, lastActivityIso, maxSpanSeconds, nowMs }),
    }
  }, [
    timeFrom,
    timeTo,
    isAllTime,
    lastActivityIso,
    allTimeLowerBoundIso,
    maxSpanSeconds,
    coverageFromIso,
    coverageToIso,
  ])

  const onTimeChange = useCallback(
    (from?: string, to?: string) => {
      const [nextFrom, nextTo] = applyAnalyticsTimeChange(from, to)
      setTimeFrom(nextFrom)
      setTimeTo(nextTo)
    },
    [setTimeFrom, setTimeTo],
  )

  const onBrushSelect = useCallback(
    (range: { from: string; to: string } | null) => {
      const [nextFrom, nextTo] = applyAnalyticsBrushSelect(range)
      setTimeFrom(nextFrom)
      setTimeTo(nextTo)
    },
    [setTimeFrom, setTimeTo],
  )

  return {
    timeFrom,
    timeTo,
    isAllTime,
    hasExplicitRange: !isAllTime,
    listRange,
    trendRange,
    // The clipped bounds, not the raw params: a selection reaching past coverage must
    // read back as what was answered, not as what was asked for.
    pickerStartFrom: isAllTime ? undefined : (listRange.fromIso ?? timeFrom),
    pickerStartTo: isAllTime ? undefined : timeTo ? listRange.toIso : undefined,
    onTimeChange,
    onBrushSelect,
  }
}
