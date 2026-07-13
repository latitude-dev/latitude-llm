import type { FilterSet } from "@domain/shared"
import { useMountEffect } from "@repo/ui"
import { useCallback, useMemo } from "react"
import { defaultProjectTimeWindowSeconds } from "../../../../../domains/projects/default-time-window.ts"
import { withSessionDefaults } from "../../../../../domains/sessions/sessions.collection.ts"
import { useProjectLastTraceAt } from "../../../../../domains/traces/traces.collection.ts"
import { getTimeFilterValue, parseFilters, serializeFilters } from "./trace-page-state.ts"

interface HistogramRange {
  readonly rangeStartIso: string
  readonly rangeEndIso: string
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in use-project-time-window.test.ts)
// ---------------------------------------------------------------------------

/** No lower bound on the time filter — reads are "All time". */
export function isAllTimeRead(filters: FilterSet): boolean {
  return getTimeFilterValue(filters, "gte") === undefined
}

/** Time-picker change → next filters. An empty selection clears the range back to "All time". */
export function applyTimeFilterChange(filters: FilterSet, from?: string, to?: string): FilterSet {
  const next = { ...filters }
  if (from || to) {
    next.startTime = [
      ...(from ? [{ op: "gte" as const, value: from }] : []),
      ...(to ? [{ op: "lte" as const, value: to }] : []),
    ]
  } else {
    delete next.startTime
  }
  return next
}

/** Histogram brush selection → next filters. Clearing the brush (`null`) returns to "All time". */
export function applyTimeRangeSelect(filters: FilterSet, range: { from: string; to: string } | null): FilterSet {
  const next = { ...filters }
  if (range) {
    next.startTime = [
      { op: "gte", value: range.from },
      { op: "lte", value: range.to },
    ]
  } else {
    delete next.startTime
  }
  return next
}

/**
 * Anchors the histogram to the latest activity when reads are unbounded ("All time"), so it charts a
 * real window ending at the most recent trace instead of an empty "last N days from now".
 */
export function computeHistogramRangeOverride(
  allTime: boolean,
  lastTraceAt: string | null | undefined,
  spanSeconds: number,
): HistogramRange | undefined {
  if (!allTime || !lastTraceAt) return undefined
  const endMs = Date.parse(lastTraceAt)
  if (!Number.isFinite(endMs)) return undefined
  return {
    rangeStartIso: new Date(endMs - spanSeconds * 1000).toISOString(),
    rangeEndIso: new Date(endMs).toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseProjectTimeWindowInput {
  readonly project: { readonly id: string; readonly isShowcase: boolean }
  readonly filters: FilterSet
  readonly setRawFilters: (updater: (prev: string) => string) => void
  readonly isSessions: boolean
  readonly searchQuery?: string
}

interface ProjectTimeWindow {
  /** Read filters — the user's picked range, or unbounded ("All time") by default. */
  readonly filtersWithDefaultTime: FilterSet
  /** `filtersWithDefaultTime` plus session-only orphan-fragment hiding when in sessions mode. */
  readonly effectiveFilters: FilterSet
  readonly timeFrom: string | undefined
  readonly timeTo: string | undefined
  readonly histogramRangeOverride: HistogramRange | undefined
  readonly onTimeFilterChange: (from?: string, to?: string) => void
  readonly onTimeRangeSelect: (range: { from: string; to: string } | null) => void
}

/**
 * Owns the Sessions/Traces time window. The default is "All time" (no lower bound) — a picked range
 * lives in `filters.startTime`, and clearing it returns to All time. The histogram is clamped to a
 * bounded span (anchored to the latest activity when All time) so an unbounded list never triggers an
 * unbounded per-bucket scan.
 */
export function useProjectTimeWindow({
  project,
  filters,
  setRawFilters,
  isSessions,
  searchQuery,
}: UseProjectTimeWindowInput): ProjectTimeWindow {
  const histogramSpanSeconds = defaultProjectTimeWindowSeconds(project)
  const allTime = isAllTimeRead(filters)

  const effectiveFilters = useMemo(() => (isSessions ? withSessionDefaults(filters) : filters), [filters, isSessions])

  // Fetch the anchor whenever reads are All time; the query returns null when the project has no
  // data (a robust signal, unlike the best-effort `firstTraceAt` flag). Forward `searchQuery` so the
  // anchor matches the searched list scope (and its query key invalidates when the search changes).
  const { lastTraceAt } = useProjectLastTraceAt({
    projectId: project.id,
    filters,
    enabled: allTime,
    ...(searchQuery ? { searchQuery } : {}),
  })

  const histogramRangeOverride = useMemo(
    () => computeHistogramRangeOverride(allTime, lastTraceAt, histogramSpanSeconds),
    [allTime, lastTraceAt, histogramSpanSeconds],
  )

  const onTimeFilterChange = useCallback(
    (from?: string, to?: string) => {
      setRawFilters((prev) => serializeFilters(applyTimeFilterChange(parseFilters(prev || undefined), from, to)) ?? "")
    },
    [setRawFilters],
  )

  const onTimeRangeSelect = useCallback(
    (range: { from: string; to: string } | null) => {
      setRawFilters((prev) => serializeFilters(applyTimeRangeSelect(parseFilters(prev || undefined), range)) ?? "")
    },
    [setRawFilters],
  )

  useMountEffect(() => {
    if (!project.isShowcase || !allTime) return
    onTimeFilterChange(new Date(Date.now() - histogramSpanSeconds * 1000).toISOString())
  })

  return {
    filtersWithDefaultTime: filters,
    effectiveFilters,
    timeFrom: getTimeFilterValue(filters, "gte"),
    timeTo: getTimeFilterValue(filters, "lte"),
    histogramRangeOverride,
    onTimeFilterChange,
    onTimeRangeSelect,
  }
}
