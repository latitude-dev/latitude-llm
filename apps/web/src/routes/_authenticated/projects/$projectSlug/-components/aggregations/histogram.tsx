import type { FilterSet } from "@domain/shared"
import { denseTraceTimeHistogramBuckets, type TraceHistogramMetric } from "@domain/spans"
import { BarChart, HistogramSkeleton, Text } from "@repo/ui"
import { useCallback, useMemo } from "react"

import { useProjectAlertIncidentsInRange } from "../../../../../../domains/alerts/alerts.collection.ts"
import { IncidentMarkerPopover } from "../../../../../../domains/alerts/incident-marker-popover.tsx"
import { buildIncidentMarkers } from "../../../../../../domains/alerts/incident-markers.ts"
import { useIncidentBucketHoverPopover } from "../../../../../../domains/alerts/use-incident-bucket-hover-popover.ts"
import { useTraceTimeHistogram } from "../../../../../../domains/traces/traces.collection.ts"
import { HISTOGRAM_METRIC_DEFINITIONS } from "./histogram-metrics.ts"

function formatBucketAxisLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface HistogramProps {
  readonly projectId: string
  readonly projectSlug: string
  readonly filters: FilterSet
  readonly metric: TraceHistogramMetric
  /** When true, fetch and overlay incidents on the histogram. */
  readonly showIncidents: boolean
  /** Called when user selects a time range via brush on the histogram. */
  readonly onRangeSelect?: ((range: { from: string; to: string } | null) => void) | undefined
}

export function Histogram({ projectId, projectSlug, filters, metric, showIncidents, onRangeSelect }: HistogramProps) {
  const {
    data: sparseBuckets,
    isLoading,
    isError,
    rangeStartIso,
    rangeEndIso,
    bucketSeconds,
  } = useTraceTimeHistogram({ projectId, filters })

  const denseBuckets = useMemo(
    () => denseTraceTimeHistogramBuckets(sparseBuckets, rangeStartIso, rangeEndIso, bucketSeconds),
    [sparseBuckets, rangeStartIso, rangeEndIso, bucketSeconds],
  )

  const definition = HISTOGRAM_METRIC_DEFINITIONS[metric]

  const chartData = useMemo(
    () =>
      denseBuckets.map((b) => ({
        category: formatBucketAxisLabel(b.bucketStart),
        value: definition.selectBucket(b),
      })),
    [denseBuckets, definition],
  )

  const { data: incidents } = useProjectAlertIncidentsInRange({
    projectId,
    fromIso: rangeStartIso,
    toIso: rangeEndIso,
    enabled: showIncidents,
  })

  const { overlay, incidentsTouchingBucketIndex } = useMemo(() => {
    if (!showIncidents || incidents.length === 0 || denseBuckets.length === 0) {
      return { overlay: undefined, incidentsTouchingBucketIndex: new Map() }
    }
    const result = buildIncidentMarkers({
      bucketStartsMs: denseBuckets.map((b) => Date.parse(b.bucketStart)),
      bucketWidthMs: bucketSeconds * 1000,
      incidents,
      nowMs: Date.parse(rangeEndIso),
    })
    return {
      overlay: result.overlay,
      // Tooltip listing — use "touching" so a bucket inside an escalation range still surfaces
      // the escalation, not nothing.
      incidentsTouchingBucketIndex: result.incidentsTouchingBucketIndex,
    }
  }, [showIncidents, incidents, denseBuckets, bucketSeconds, rangeEndIso])

  const handleSelect = useCallback(
    (range: { startIndex: number; endIndex: number } | null) => {
      if (!onRangeSelect) return
      if (!range) {
        onRangeSelect(null)
        return
      }
      const startBucket = denseBuckets[range.startIndex]
      const endBucket = denseBuckets[range.endIndex]
      if (!startBucket || !endBucket) return
      const from = startBucket.bucketStart
      const toEndMs = Date.parse(endBucket.bucketStart) + bucketSeconds * 1000
      const to = new Date(toEndMs).toISOString()
      onRangeSelect({ from, to })
    },
    [denseBuckets, bucketSeconds, onRangeSelect],
  )

  // Tooltip stays on every bucket — it carries the metric value and is independent of the
  // incident popover. Both coexist when the bucket has incidents.
  const formatTooltip = useCallback(
    (category: string, value: number) =>
      `${category}<br/><b>${definition.formatBucket(value)}</b> ${definition.tooltipNoun}`,
    [definition],
  )

  // Popover state machine — see use-incident-bucket-hover-popover.ts. Shared with the issues
  // analytics panel.
  const {
    popover,
    popoverIncidents,
    handleBucketAxisPointerChange,
    onOpenChange: onPopoverOpenChange,
    onContentMouseEnter,
    onContentMouseLeave,
  } = useIncidentBucketHoverPopover({ incidentsTouchingBucketIndex })

  if (isLoading) {
    return (
      <div className="px-4 py-3">
        <HistogramSkeleton height={160} />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex w-full min-h-[80px] items-center justify-center px-4 py-3">
        <Text.H6 color="destructive">Could not load analytics</Text.H6>
      </div>
    )
  }

  if (denseBuckets.length === 0) {
    return (
      <div className="flex w-full min-h-[80px] items-center justify-center px-4 py-3">
        <Text.H6 color="foregroundMuted">No activity in this time window</Text.H6>
      </div>
    )
  }

  return (
    <div className="px-4 py-3">
      <BarChart
        data={chartData}
        height={160}
        showYAxis={false}
        ariaLabel={`${definition.label} by time bucket`}
        formatTooltip={formatTooltip}
        onSelect={onRangeSelect ? handleSelect : undefined}
        {...(overlay ? { overlay } : {})}
        {...(showIncidents ? { onBucketAxisPointerChange: handleBucketAxisPointerChange } : {})}
      />
      <IncidentMarkerPopover
        open={popover !== null}
        anchor={popover?.anchor ?? null}
        incidents={popoverIncidents}
        projectSlug={projectSlug}
        onOpenChange={onPopoverOpenChange}
        onContentMouseEnter={onContentMouseEnter}
        onContentMouseLeave={onContentMouseLeave}
      />
    </div>
  )
}
