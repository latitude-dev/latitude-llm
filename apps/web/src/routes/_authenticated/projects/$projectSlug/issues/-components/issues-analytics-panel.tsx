import { BarChart, Button, HistogramSkeleton, Icon, Skeleton, Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { BarChart2, ChevronDown, ChevronUp, ShieldAlertIcon, ShieldOffIcon } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useProjectAlertIncidentsInRange } from "../../../../../../domains/alerts/alerts.collection.ts"
import { buildIncidentMarkers, renderIncidentsTooltipBlock } from "../../../../../../domains/alerts/incident-markers.ts"
import { useShowIncidentsOverlay } from "../../../../../../domains/alerts/use-show-incidents-overlay.ts"
import type { IssuesListResultRecord } from "../../../../../../domains/issues/issues.functions.ts"
import { formatHistogramBucketLabel, formatHistogramBucketTooltipLabel } from "./issue-formatters.ts"

const COUNT_CARDS = [
  { key: "newIssues", label: "New" },
  { key: "escalatingIssues", label: "Escalating" },
  { key: "ongoingIssues", label: "Ongoing" },
  { key: "regressedIssues", label: "Regressed" },
  { key: "resolvedIssues", label: "Resolved" },
  { key: "seenOccurrences", label: "Occurrences" },
] as const

function AggregationItem({
  label,
  value,
  isLoading,
  skeletonWidthClassName = "w-16",
}: {
  readonly label: string
  readonly value: string
  readonly isLoading?: boolean
  readonly skeletonWidthClassName?: string
}) {
  return (
    <div className="flex basis-[176px] min-w-[176px] shrink-0 flex-col gap-2">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {isLoading ? (
        <Skeleton className={`h-5 ${skeletonWidthClassName}`} />
      ) : (
        <Text.H5 color="foreground" className="tabular-nums">
          {value}
        </Text.H5>
      )}
    </div>
  )
}

export function IssuesAnalyticsPanel({
  projectId,
  analytics,
  isLoading,
  onRangeSelect,
}: {
  readonly projectId: string
  readonly analytics: IssuesListResultRecord["analytics"]
  readonly isLoading: boolean
  readonly onRangeSelect?: ((range: { from: string; to: string } | null) => void) | undefined
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [showLeftFade, setShowLeftFade] = useState(false)
  const { flagEnabled: incidentsFlagEnabled, showIncidents, setShowIncidents } = useShowIncidentsOverlay()
  const incidentsActive = incidentsFlagEnabled && showIncidents

  const bucketSeconds = analytics.histogramBucketSeconds
  const bucketWidthMs = bucketSeconds * 1000

  const histogramBarChartData = useMemo(
    () =>
      analytics.histogram.map((bucket) => ({
        category: formatHistogramBucketLabel(bucket.bucket, bucketSeconds).replaceAll(" ", " "),
        tooltipCategory: formatHistogramBucketTooltipLabel(bucket.bucket, bucketSeconds),
        value: bucket.count,
      })),
    [analytics.histogram, bucketSeconds],
  )

  // Incidents are queried over the SAME window the histogram already paints, so the range
  // derives from the first/last bucket keys (now ISO timestamps) rather than the page's filter
  // state.
  const incidentRange = useMemo(() => {
    if (analytics.histogram.length === 0) return null
    const firstBucket = analytics.histogram[0]
    const lastBucket = analytics.histogram[analytics.histogram.length - 1]
    if (!firstBucket || !lastBucket) return null
    return {
      fromIso: new Date(Date.parse(firstBucket.bucket)).toISOString(),
      toIso: new Date(Date.parse(lastBucket.bucket) + bucketWidthMs - 1).toISOString(),
    }
  }, [analytics.histogram, bucketWidthMs])

  const { data: incidents } = useProjectAlertIncidentsInRange({
    projectId,
    fromIso: incidentRange?.fromIso ?? "",
    toIso: incidentRange?.toIso ?? "",
    // Filter to issue-sourced incidents only — the histogram is about issues, not other future
    // alert sources (saved-search thresholds, etc.).
    sourceType: "issue",
    enabled: incidentsActive && incidentRange !== null,
  })

  const { overlay, incidentsTouchingBucketIndex } = useMemo(() => {
    if (!incidentsActive || incidents.length === 0 || analytics.histogram.length === 0 || !incidentRange) {
      return { overlay: undefined, incidentsTouchingBucketIndex: new Map() }
    }
    const bucketStartsMs = analytics.histogram.map((b) => Date.parse(b.bucket))
    const result = buildIncidentMarkers({
      bucketStartsMs,
      bucketWidthMs,
      incidents,
      nowMs: Date.parse(incidentRange.toIso),
    })
    return {
      overlay: result.overlay,
      // Tooltip listing — see histogram.tsx for the rationale on using the "touching" map.
      incidentsTouchingBucketIndex: result.incidentsTouchingBucketIndex,
    }
  }, [incidentsActive, incidents, analytics.histogram, incidentRange, bucketWidthMs])

  const formatHistogramTooltip = useCallback(
    (category: string, value: number, dataIndex: number) => {
      const base = `${category}<br/><b>${formatCount(value)}</b> occurrences`
      const touching = incidentsTouchingBucketIndex.get(dataIndex) ?? []
      return base + renderIncidentsTooltipBlock(touching)
    },
    [incidentsTouchingBucketIndex],
  )

  const handleSelect = useCallback(
    (range: { startIndex: number; endIndex: number } | null) => {
      if (!onRangeSelect) return

      if (!range) {
        onRangeSelect(null)
        return
      }

      const startBucket = analytics.histogram[range.startIndex]
      const endBucket = analytics.histogram[range.endIndex]
      if (!startBucket || !endBucket) return

      const from = new Date(Date.parse(startBucket.bucket)).toISOString()
      const to = new Date(Date.parse(endBucket.bucket) + bucketWidthMs - 1).toISOString()

      onRangeSelect({ from, to })
    },
    [analytics.histogram, onRangeSelect, bucketWidthMs],
  )

  if (collapsed) {
    return (
      <div className="flex flex-col rounded-lg bg-secondary">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-1.5">
            <Icon icon={BarChart2} size="sm" color="foregroundMuted" />
            <Text.H6 color="foregroundMuted">Issues statistics</Text.H6>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} aria-label="Expand statistics">
            <Icon icon={ChevronDown} size="sm" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-lg bg-secondary">
      <div className="p-2">
        <div className="flex items-start gap-1 pr-2">
          <div className="relative min-w-0 flex-1">
            <div
              className="flex flex-row gap-3 overflow-x-auto p-4"
              onScroll={(e) => setShowLeftFade(e.currentTarget.scrollLeft > 0)}
            >
              {COUNT_CARDS.map((card) => (
                <AggregationItem
                  key={card.key}
                  label={card.label}
                  value={formatCount(analytics.counts[card.key])}
                  isLoading={isLoading}
                  skeletonWidthClassName={card.key === "seenOccurrences" ? "w-20" : "w-16"}
                />
              ))}
            </div>
            {showLeftFade && (
              <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-secondary to-transparent" />
            )}
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-secondary to-transparent" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse statistics"
            className="shrink-0"
          >
            <Icon icon={ChevronUp} size="sm" />
          </Button>
        </div>

        {isLoading ? (
          <div className="px-4 py-3">
            <HistogramSkeleton height={160} />
          </div>
        ) : analytics.histogram.length === 0 || analytics.histogram.every((bucket) => bucket.count === 0) ? (
          <div className="flex w-full min-h-[80px] items-center justify-center px-4 py-3">
            <Text.H6 color="foregroundMuted">No issue occurrences in this time window</Text.H6>
          </div>
        ) : (
          <>
            {incidentsFlagEnabled ? (
              <div className="flex items-center justify-end gap-2 px-4 -mb-1">
                <Tooltip
                  asChild
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowIncidents((prev) => !prev)}
                      aria-pressed={showIncidents}
                    >
                      <Icon icon={showIncidents ? ShieldAlertIcon : ShieldOffIcon} size="sm" />
                      Incidents
                    </Button>
                  }
                >
                  Overlay incidents on the timeline
                </Tooltip>
              </div>
            ) : null}
            <div className="px-4 py-3">
              <BarChart
                data={histogramBarChartData}
                height={160}
                showYAxis={false}
                xAxisLabelFontSize={10}
                ariaLabel="Issue occurrences over time"
                formatTooltip={formatHistogramTooltip}
                onSelect={onRangeSelect ? handleSelect : undefined}
                {...(overlay ? { overlay } : {})}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
