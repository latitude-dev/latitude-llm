import type { AlertSeverity } from "@domain/alerts"
import { ChartSkeleton, Text, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from "@repo/ui"
import { formatCount } from "@repo/utils"
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
const BAR_TOP_HEADROOM_PERCENT = 100 - MAX_VISIBLE_BAR_HEIGHT_PERCENT
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
  showEscalationThresholdGuide = false,
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
  readonly escalationOccurrenceThreshold?: number | null
  readonly showEscalationThresholdGuide?: boolean
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
  const chartBuckets = buckets.map((bucket) => ({
    key: bucket.bucket,
    label: formatHistogramBucketLabel(bucket.bucket, bucketSeconds),
    tooltipLabel: formatHistogramBucketTooltipLabel(bucket.bucket, bucketSeconds),
    count: bucket.count,
  }))
  const visibleBucketLabelIndices = getVisibleBucketLabelIndices(chartBuckets.length, maxVisibleBucketLabels)
  const maxCount = Math.max(...chartBuckets.map((bucket) => bucket.count), 1)
  const resolvedAtMs = resolvedAt ? new Date(resolvedAt).getTime() : null
  const isRegressedIssue = states.includes("regressed")
  const isEscalatingIssue = states.includes("escalating")
  const escalationGuideCount =
    showEscalationThresholdGuide && isEscalatingIssue && escalationOccurrenceThreshold !== null
      ? escalationOccurrenceThreshold
      : null
  const escalationGuideHeightPercent =
    escalationGuideCount !== null ? toVisibleHeightPercent(escalationGuideCount, maxCount) : null
  const escalationGuideBottomPercent =
    escalationGuideHeightPercent !== null ? Math.max(0, escalationGuideHeightPercent - BAR_TOP_HEADROOM_PERCENT) : null
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
    const isEscalatingBucket =
      !isRegressedBucket &&
      isEscalatingIssue &&
      escalationOccurrenceThreshold !== null &&
      bucket.count >= escalationOccurrenceThreshold
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
            {visualBuckets.map((bucket) => {
              const startedHere = bucket.incidentInfo.startedHere
              const coveringSeverity = bucket.incidentInfo.coveringRangeSeverity
              const showIncidentExtras =
                incidentsEnabled &&
                (startedHere.length > 0 || coveringSeverity !== null || bucket.incidentInfo.ongoingRanges.length > 0)
              return (
                <TooltipRoot key={bucket.key} delayDuration={100}>
                  <TooltipTrigger asChild>
                    <span className="group/bucket relative flex h-full min-w-0 flex-1 items-end">
                      {coveringSeverity !== null ? (
                        <span
                          className="pointer-events-none absolute inset-0 z-[0] rounded-[2px]"
                          style={{
                            background: INCIDENT_SEVERITY_COLOR[coveringSeverity],
                            opacity: 0.16,
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
          {escalationGuideCount !== null && escalationGuideBottomPercent !== null ? (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[2]"
              style={{ top: MINI_HISTOGRAM_TOP_INSET_PX }}
              aria-hidden
            >
              <div
                className={`absolute inset-x-0 border-t border-dashed ${DEFAULT_MUTED_GUIDE_CLASSES}`}
                style={{ bottom: `${escalationGuideBottomPercent}%` }}
              />
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
