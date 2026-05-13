import type { AlertSeverity } from "@domain/alerts"
import { ChartSkeleton, Text, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useMemo } from "react"
import type { AlertIncidentRecord } from "../../../../../../domains/alerts/alerts.functions.ts"
import {
  formatIncidentKindLabel,
  groupIncidentsByBucket,
  INCIDENT_SEVERITY_COLOR,
} from "../../../../../../domains/alerts/incident-markers.ts"
import { formatHistogramBucketLabel, formatHistogramBucketTooltipLabel } from "./issue-formatters.ts"

const DEFAULT_MAX_VISIBLE_BUCKET_LABELS = 6
const MIN_VISIBLE_BAR_HEIGHT_PERCENT = 12
const MAX_VISIBLE_BAR_HEIGHT_PERCENT = 88
const MINI_HISTOGRAM_GUIDE_LINE_COUNT = 5
const MINI_HISTOGRAM_TOP_INSET_PX = 6
const REGRESSED_BAR_CLASSES = "bg-rose-700 dark:bg-rose-400"
const ESCALATING_BAR_CLASSES = "bg-yellow-500/75 dark:bg-yellow-300/85"
const DEFAULT_ROW_BAR_CLASSES = "bg-muted-foreground/60 dark:bg-muted-foreground/70"
const DEFAULT_BACKGROUND_GUIDE_CLASSES = "border-border/60 dark:border-muted-foreground/30"
const DEFAULT_MUTED_GUIDE_CLASSES = "border-muted-foreground/60 dark:border-muted-foreground/70"
const DEFAULT_BUCKET_SECONDS = 24 * 60 * 60
const SEVERITY_RANK: Record<AlertSeverity, number> = { medium: 1, high: 2 }

/**
 * Parses either an ISO timestamp (sub-day or aligned) or a legacy `YYYY-MM-DD` string into
 * the bucket's start ms. The latter shape is still emitted by the per-issue list mini-bar;
 * the detail trend now uses ISO 12h timestamps.
 */
function parseBucketStartMs(bucket: string): number {
  return Date.parse(bucket.length === 10 ? `${bucket}T00:00:00.000Z` : bucket)
}

function toBucketEndMs(bucket: string, bucketWidthMs: number): number {
  const startMs = parseBucketStartMs(bucket)
  return Number.isFinite(startMs) ? startMs + bucketWidthMs - 1 : Number.NaN
}

function resolveBarClasses(input: {
  readonly barVariant: "row" | "details"
  readonly isRegressedBucket: boolean
  readonly isEscalatingBucket: boolean
  readonly hasLifecycleHighlight: boolean
}) {
  if (input.isRegressedBucket) {
    return REGRESSED_BAR_CLASSES
  }

  if (input.isEscalatingBucket) {
    return ESCALATING_BAR_CLASSES
  }

  if (input.hasLifecycleHighlight) {
    return DEFAULT_ROW_BAR_CLASSES
  }

  return DEFAULT_ROW_BAR_CLASSES
}

/**
 * Build a single SVG `<path>` `d` attribute that smoothly connects the given points using a
 * Catmull-Rom spline expressed as cubic Bezier segments. Endpoints duplicate themselves as
 * virtual neighbours so the curve doesn't accelerate at the boundary. Coordinates are emitted
 * with 3 decimals — enough for sub-pixel placement when the SVG scales to its container.
 */
function buildSmoothThresholdPath(points: readonly { readonly x: number; readonly y: number }[]): string {
  if (points.length === 0) return ""
  const first = points[0]
  if (!first) return ""
  if (points.length === 1) {
    // Single point inside an otherwise-broken segment: draw a tiny horizontal dash so the
    // datum is still visible (otherwise an isolated bucket would render as nothing).
    return `M ${(first.x - 0.3).toFixed(3)} ${first.y.toFixed(3)} L ${(first.x + 0.3).toFixed(3)} ${first.y.toFixed(3)}`
  }

  const parts: string[] = [`M ${first.x.toFixed(3)} ${first.y.toFixed(3)}`]
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]
    const p2 = points[i + 1]
    if (!p1 || !p2) continue
    const p0 = points[i - 1] ?? p1
    const p3 = points[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    parts.push(
      `C ${cp1x.toFixed(3)} ${cp1y.toFixed(3)}, ${cp2x.toFixed(3)} ${cp2y.toFixed(3)}, ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`,
    )
  }
  return parts.join(" ")
}

function getVisibleBucketLabelIndices(totalBuckets: number, maxVisibleBucketLabels: number): ReadonlySet<number> {
  if (totalBuckets <= 0) {
    return new Set()
  }

  if (totalBuckets <= maxVisibleBucketLabels) {
    return new Set(Array.from({ length: totalBuckets }, (_, index) => index))
  }

  const labelCount = Math.max(2, maxVisibleBucketLabels)
  return new Set(
    Array.from({ length: labelCount }, (_, index) => Math.round((index * (totalBuckets - 1)) / (labelCount - 1))),
  )
}

function toVisibleHeightPercent(count: number, maxCount: number): number {
  if (count === 0) {
    return 0
  }

  return Math.max(MIN_VISIBLE_BAR_HEIGHT_PERCENT, (count / maxCount) * MAX_VISIBLE_BAR_HEIGHT_PERCENT)
}

interface IncidentBucketInfo {
  /** Severity of the highest-severity range that covers this bucket; `null` when no range covers it. */
  readonly coveringRangeSeverity: AlertSeverity | null
  /** Incidents whose `startedAt` snaps into this bucket — these draw a vertical tick + dot. */
  readonly startedHere: readonly AlertIncidentRecord[]
  /** Range incidents that cover this bucket but did NOT start here — used to enrich the tooltip. */
  readonly ongoingRanges: readonly AlertIncidentRecord[]
}

const EMPTY_INCIDENT_INFO: IncidentBucketInfo = {
  coveringRangeSeverity: null,
  startedHere: [],
  ongoingRanges: [],
}

function buildIncidentInfoByBucket(
  bucketKeys: readonly string[],
  incidents: readonly AlertIncidentRecord[],
  bucketWidthMs: number,
): readonly IncidentBucketInfo[] {
  if (incidents.length === 0 || bucketKeys.length === 0) {
    return bucketKeys.map(() => EMPTY_INCIDENT_INFO)
  }
  const grouping = groupIncidentsByBucket({
    bucketStartsMs: bucketKeys.map(parseBucketStartMs),
    bucketWidthMs,
    incidents,
    nowMs: Date.now(),
  })

  const info: IncidentBucketInfo[] = bucketKeys.map(() => ({
    coveringRangeSeverity: null,
    startedHere: [],
    ongoingRanges: [],
  }))

  for (const [index, bucketIncidents] of grouping.incidentsByBucketIndex) {
    const slot = info[index]
    if (slot) info[index] = { ...slot, startedHere: bucketIncidents }
  }

  for (const range of grouping.ranges) {
    for (let i = range.startIndex; i <= range.endIndex; i++) {
      const slot = info[i]
      if (!slot) continue
      const sev = range.incident.severity
      const next: IncidentBucketInfo = {
        coveringRangeSeverity:
          slot.coveringRangeSeverity === null || SEVERITY_RANK[sev] > SEVERITY_RANK[slot.coveringRangeSeverity]
            ? sev
            : slot.coveringRangeSeverity,
        startedHere: slot.startedHere,
        ongoingRanges: i === range.startIndex ? slot.ongoingRanges : [...slot.ongoingRanges, range.incident],
      }
      info[i] = next
    }
  }

  return info
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
}

function IncidentBucketTooltipExtras({ info }: { readonly info: IncidentBucketInfo }) {
  const lines: {
    key: string
    severity: AlertSeverity
    label: string
    sub: string
  }[] = []
  for (const incident of info.startedHere) {
    lines.push({
      key: `start-${incident.id}`,
      severity: incident.severity,
      label: formatIncidentKindLabel(incident.kind),
      sub:
        incident.kind === "issue.escalating" && incident.endedAt
          ? `Started ${formatTime(incident.startedAt)} → ${formatTime(incident.endedAt)}`
          : incident.kind === "issue.escalating"
            ? `Started ${formatTime(incident.startedAt)} · ongoing`
            : formatTime(incident.startedAt),
    })
  }
  for (const incident of info.ongoingRanges) {
    lines.push({
      key: `ongoing-${incident.id}`,
      severity: incident.severity,
      label: `${formatIncidentKindLabel(incident.kind)} (ongoing)`,
      sub:
        incident.endedAt !== null
          ? `${formatTime(incident.startedAt)} → ${formatTime(incident.endedAt)}`
          : `Started ${formatTime(incident.startedAt)}`,
    })
  }
  if (lines.length === 0) return null

  return (
    <div className="mt-1 flex flex-col gap-1 border-t border-border/60 pt-1">
      {lines.map((line) => (
        <div key={line.key} className="flex items-start gap-1.5">
          <span
            aria-hidden
            className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: INCIDENT_SEVERITY_COLOR[line.severity] }}
          />
          <div className="flex flex-col">
            <Text.H6B>{line.label}</Text.H6B>
            <Text.H6 color="foregroundMuted">{line.sub}</Text.H6>
          </div>
        </div>
      ))}
    </div>
  )
}

export function IssueTrendBar({
  buckets,
  height = 48,
  isLoading = false,
  emptyLabel = "No issue occurrences",
  showLabels = true,
  labelLayout = "bucket",
  maxVisibleBucketLabels = DEFAULT_MAX_VISIBLE_BUCKET_LABELS,
  barVariant = "row",
  states = [],
  resolvedAt = null,
  escalationOccurrenceThreshold = null,
  escalationThresholds = null,
  incidents = [],
  bucketSeconds = DEFAULT_BUCKET_SECONDS,
}: {
  readonly buckets: readonly {
    readonly bucket: string
    readonly count: number
  }[]
  readonly height?: number
  readonly isLoading?: boolean
  readonly emptyLabel?: string
  readonly showLabels?: boolean
  readonly labelLayout?: "bucket" | "floating"
  readonly maxVisibleBucketLabels?: number
  readonly barVariant?: "row" | "details"
  readonly states?: readonly string[]
  readonly resolvedAt?: string | null
  /**
   * Legacy flat escalation threshold from the pre-seasonal detector. Used by the row variant
   * for the per-bucket "escalating" highlight when `escalationThresholds` isn't supplied; the
   * detail variant prefers the per-bucket series below.
   */
  readonly escalationOccurrenceThreshold?: number | null
  /**
   * Per-bucket seasonal entry-band projection from the detector. When provided, a dashed line
   * traces the threshold across the chart and per-bucket coloring uses each bucket's own
   * threshold instead of a single flat value. Buckets with `thresholdCount = NaN` represent a
   * region of the chart with no contributing prior history — the line is hidden for those
   * spans.
   */
  readonly escalationThresholds?: readonly { readonly bucket: string; readonly thresholdCount: number }[] | null
  /**
   * Incidents to overlay on the trend. Only honored when `barVariant="details"` so the
   * row-level mini-bars in the issues table stay clean. Caller is expected to have filtered to
   * the relevant issue (`sourceId`) — the component doesn't filter again.
   */
  readonly incidents?: readonly AlertIncidentRecord[]
  /**
   * Width (seconds) of each bucket. Defaults to 24h to match the daily list mini-bar; the
   * issue detail drawer passes 12h so incident overlays can land in the right half-day.
   */
  readonly bucketSeconds?: number
}) {
  // All derived chart state lives in `useMemo` blocks so hooks run unconditionally above the
  // early returns below and downstream consumers (segments, paths) skip recomputation when
  // inputs haven't changed.
  const chartBuckets = useMemo(() => {
    // Map per-bucket thresholds by key so we can zip against `buckets` regardless of how the
    // caller ordered them. NaN entries are kept so we know "history was missing here" vs
    // "no series at all" — both yield no overlay for that bar.
    const thresholdByBucket = new Map<string, number>()
    if (escalationThresholds) {
      for (const entry of escalationThresholds) thresholdByBucket.set(entry.bucket, entry.thresholdCount)
    }
    return buckets.map((bucket) => {
      const threshold = thresholdByBucket.get(bucket.bucket)
      return {
        key: bucket.bucket,
        label: formatHistogramBucketLabel(bucket.bucket, bucketSeconds),
        tooltipLabel: formatHistogramBucketTooltipLabel(bucket.bucket, bucketSeconds),
        count: bucket.count,
        thresholdCount: threshold !== undefined && Number.isFinite(threshold) ? threshold : null,
      }
    })
  }, [buckets, escalationThresholds, bucketSeconds])

  const hasSeasonalThresholds = useMemo(
    () => chartBuckets.some((bucket) => bucket.thresholdCount !== null),
    [chartBuckets],
  )

  const visibleBucketLabelIndices = useMemo(
    () => getVisibleBucketLabelIndices(chartBuckets.length, maxVisibleBucketLabels),
    [chartBuckets.length, maxVisibleBucketLabels],
  )

  // Threshold values participate in the scale so the dashed line never clips off the top.
  const maxCount = useMemo(
    () => Math.max(...chartBuckets.map((bucket) => Math.max(bucket.count, bucket.thresholdCount ?? 0)), 1),
    [chartBuckets],
  )

  // Group consecutive buckets that carry a threshold into smoothable segments. A null
  // breaks the line — that span had no contributing prior history, so any "expected" value
  // would be misleading. SVG coordinates use the chart-wide viewBox set on the overlay below:
  // x = bucket center (i + 0.5) in 0..N space, y = 100 − heightPercent in 0..100 space.
  const thresholdSegments = useMemo<{ readonly x: number; readonly y: number }[][]>(() => {
    const segments: { x: number; y: number }[][] = []
    let active: { x: number; y: number }[] = []
    chartBuckets.forEach((bucket, index) => {
      if (bucket.thresholdCount === null) {
        if (active.length > 0) {
          segments.push(active)
          active = []
        }
        return
      }
      const heightPercent = toVisibleHeightPercent(bucket.thresholdCount, maxCount)
      active.push({ x: index + 0.5, y: 100 - heightPercent })
    })
    if (active.length > 0) segments.push(active)
    return segments
  }, [chartBuckets, maxCount])

  if (isLoading) {
    return <ChartSkeleton minHeight={height} className="border-0 bg-transparent p-0" />
  }

  if (buckets.length === 0 || buckets.every((bucket) => bucket.count === 0)) {
    return (
      <div className="flex min-h-10 items-center">
        <Text.H6 color="foregroundMuted">{emptyLabel}</Text.H6>
      </div>
    )
  }

  const bucketWidthMs = bucketSeconds * 1000

  const resolvedAtMs = resolvedAt ? new Date(resolvedAt).getTime() : null
  const isRegressedIssue = states.includes("regressed")
  const isEscalatingIssue = states.includes("escalating")
  const incidentsEnabled = barVariant === "details" && incidents.length > 0
  const incidentInfoByBucket = incidentsEnabled
    ? buildIncidentInfoByBucket(
        chartBuckets.map((b) => b.key),
        incidents,
        bucketWidthMs,
      )
    : null
  const visualBuckets = chartBuckets.map((bucket, index) => {
    const heightPercent = toVisibleHeightPercent(bucket.count, maxCount)
    const bucketStartMs = parseBucketStartMs(bucket.key)
    const bucketEndMs = toBucketEndMs(bucket.key, bucketWidthMs)
    const isRegressedBucket =
      isRegressedIssue && resolvedAtMs !== null && bucket.count > 0 && bucketEndMs > resolvedAtMs
    // Per-bucket coloring: prefer the seasonal series when available so the highlight follows
    // the same band the dashed line draws. Fall back to the legacy flat threshold (passed by
    // the row variant in the issues table) when the seasonal series isn't loaded.
    const escalatingThreshold = bucket.thresholdCount ?? escalationOccurrenceThreshold
    const isEscalatingBucket =
      !isRegressedBucket && isEscalatingIssue && escalatingThreshold !== null && bucket.count >= escalatingThreshold
    // The "this bucket contains the resolved-at moment" marker — works for both daily and
    // sub-day buckets since we just check whether resolvedAt falls in the bucket's [start, end).
    const isResolvedBoundaryBucket =
      isRegressedIssue &&
      resolvedAtMs !== null &&
      Number.isFinite(bucketStartMs) &&
      resolvedAtMs >= bucketStartMs &&
      resolvedAtMs <= bucketEndMs

    return {
      ...bucket,
      heightPercent,
      isRegressedBucket,
      isEscalatingBucket,
      isResolvedBoundaryBucket,
      incidentInfo: incidentInfoByBucket?.[index] ?? EMPTY_INCIDENT_INFO,
    }
  })
  const hasLifecycleHighlight = visualBuckets.some((bucket) => bucket.isRegressedBucket || bucket.isEscalatingBucket)

  return (
    <div className="flex min-w-0 flex-col" style={{ height }} role="img" aria-label="Issue occurrence trend">
      <TooltipProvider>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-between"
            style={{ top: MINI_HISTOGRAM_TOP_INSET_PX }}
            aria-hidden
          >
            {Array.from({ length: MINI_HISTOGRAM_GUIDE_LINE_COUNT }, (_, index) => (
              <span
                key={index}
                className={
                  index === MINI_HISTOGRAM_GUIDE_LINE_COUNT - 1
                    ? `w-full border-t ${DEFAULT_BACKGROUND_GUIDE_CLASSES}`
                    : `w-full border-t border-dashed ${DEFAULT_BACKGROUND_GUIDE_CLASSES}`
                }
              />
            ))}
          </div>
          <div
            className="absolute inset-x-0 bottom-0 flex items-end gap-1"
            style={{ top: MINI_HISTOGRAM_TOP_INSET_PX }}
          >
            {visualBuckets.map((bucket, index) => {
              const startedHere = bucket.incidentInfo.startedHere
              const coveringSeverity = bucket.incidentInfo.coveringRangeSeverity
              // Adjacent buckets with the same severity should read as one continuous shaded
              // band, not a strip of rounded blocks separated by the flex `gap-1` (4px). Extend
              // the right edge of every-but-the-last bucket in a run to cover the gap, and
              // suppress corner rounding on the merged sides so the run renders as a single
              // rectangle with rounded outer ends.
              const prevSeverity = visualBuckets[index - 1]?.incidentInfo.coveringRangeSeverity ?? null
              const nextSeverity = visualBuckets[index + 1]?.incidentInfo.coveringRangeSeverity ?? null
              const mergeLeft = coveringSeverity !== null && coveringSeverity === prevSeverity
              const mergeRight = coveringSeverity !== null && coveringSeverity === nextSeverity
              const showIncidentExtras =
                incidentsEnabled &&
                (startedHere.length > 0 || coveringSeverity !== null || bucket.incidentInfo.ongoingRanges.length > 0)
              return (
                <TooltipRoot key={bucket.key} delayDuration={100}>
                  <TooltipTrigger asChild>
                    <span className="group/bucket relative flex h-full min-w-0 flex-1 items-end">
                      {coveringSeverity !== null ? (
                        <span
                          className="pointer-events-none absolute z-[0]"
                          style={{
                            top: 0,
                            bottom: 0,
                            left: 0,
                            // -4px matches the bars container's `gap-1`; carries the tint
                            // across the gap to the next bucket. Only one side extends per pair
                            // to avoid double-tinting in the gap.
                            right: mergeRight ? -4 : 0,
                            background: INCIDENT_SEVERITY_COLOR[coveringSeverity],
                            opacity: 0.16,
                            borderTopLeftRadius: mergeLeft ? 0 : 2,
                            borderBottomLeftRadius: mergeLeft ? 0 : 2,
                            borderTopRightRadius: mergeRight ? 0 : 2,
                            borderBottomRightRadius: mergeRight ? 0 : 2,
                          }}
                          aria-hidden
                        />
                      ) : null}
                      <span
                        className="pointer-events-none absolute inset-0 rounded-[2px] bg-foreground/[0.06] opacity-0 transition-opacity group-hover/bucket:opacity-100"
                        aria-hidden
                      />
                      {bucket.isResolvedBoundaryBucket ? (
                        <span
                          className={`pointer-events-none absolute bottom-0 top-0 left-1/2 z-[2] -translate-x-1/2 border-l border-dashed ${DEFAULT_MUTED_GUIDE_CLASSES}`}
                          aria-hidden
                        />
                      ) : null}
                      <span
                        className={`relative z-[1] w-full transition-[filter] group-hover/bucket:brightness-90 ${
                          barVariant === "details"
                            ? `rounded-t-sm ${resolveBarClasses({
                                barVariant,
                                isRegressedBucket: bucket.isRegressedBucket,
                                isEscalatingBucket: bucket.isEscalatingBucket,
                                hasLifecycleHighlight,
                              })}`
                            : `rounded-t-[2px] ${resolveBarClasses({
                                barVariant,
                                isRegressedBucket: bucket.isRegressedBucket,
                                isEscalatingBucket: bucket.isEscalatingBucket,
                                hasLifecycleHighlight,
                              })}`
                        }`}
                        style={{ height: `${bucket.heightPercent}%` }}
                      />
                      {startedHere.map((incident) => (
                        <span
                          key={incident.id}
                          className="pointer-events-none absolute bottom-0 top-0 left-1/2 z-[3] -translate-x-1/2"
                          aria-hidden
                        >
                          <span
                            className="absolute bottom-0 top-1 left-1/2 -translate-x-1/2 border-l-2"
                            style={{
                              borderColor: INCIDENT_SEVERITY_COLOR[incident.severity],
                            }}
                          />
                          <span
                            className="absolute -top-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full"
                            style={{
                              background: INCIDENT_SEVERITY_COLOR[incident.severity],
                            }}
                          />
                        </span>
                      ))}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    <div className="flex flex-col gap-0.5">
                      <Text.H6>{bucket.tooltipLabel}</Text.H6>
                      {bucket.isResolvedBoundaryBucket ? (
                        <Text.H6 color="foregroundMuted">Issue was resolved</Text.H6>
                      ) : null}
                      <Text.H6B>{formatCount(bucket.count)} occurrences</Text.H6B>
                      {showIncidentExtras ? <IncidentBucketTooltipExtras info={bucket.incidentInfo} /> : null}
                    </div>
                  </TooltipContent>
                </TooltipRoot>
              )
            })}
          </div>
          {hasSeasonalThresholds ? (
            // SVG is a replaced element — `height: auto` on it resolves to the viewBox's
            // intrinsic ratio (e.g. 28×100 = 3.57:1 tall), NOT to the absolute-positioning
            // top/bottom span. That made the previous inline `<svg className="h-auto ...">`
            // render far taller than the chart and pushed the path below the clip.
            // Wrap in a positioning div so the SVG can flex-fill via plain `h-full w-full`.
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[2]"
              style={{ top: MINI_HISTOGRAM_TOP_INSET_PX }}
              aria-hidden
            >
              <svg
                className="block h-full w-full text-muted-foreground/60 dark:text-muted-foreground/70"
                viewBox={`0 0 ${chartBuckets.length} 100`}
                preserveAspectRatio="none"
                role="img"
                aria-label="Escalation threshold"
              >
                <title>Escalation threshold</title>
                {thresholdSegments.map((segment, segmentIndex) => (
                  <path
                    key={`th-seg-${segmentIndex}`}
                    d={buildSmoothThresholdPath(segment)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1}
                    strokeDasharray="3 2"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            </div>
          ) : null}
        </div>
      </TooltipProvider>
      {showLabels ? (
        labelLayout === "floating" ? (
          <div className="flex min-w-0 items-start gap-1 overflow-visible pt-1">
            {chartBuckets.map((bucket, index) => (
              <div key={bucket.key} className="relative h-5 min-w-0 flex-1 overflow-visible">
                {visibleBucketLabelIndices.has(index) ? (
                  <div className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap">
                    <Text.H6 color="foregroundMuted" noWrap>
                      {bucket.label}
                    </Text.H6>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-w-0 items-start gap-1 pt-1">
            {chartBuckets.map((bucket, index) => (
              <div key={bucket.key} className="min-w-0 flex-1 text-center">
                {visibleBucketLabelIndices.has(index) ? (
                  <Text.H6 className="truncate" color="foregroundMuted" noWrap>
                    {bucket.label}
                  </Text.H6>
                ) : (
                  <span aria-hidden className="block h-4" />
                )}
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}
