import { formatMetricValue, type MonitorMetric } from "@domain/shared"
import { BarChart, HistogramSkeleton, Text } from "@repo/ui"
import { useCallback, useMemo } from "react"
import { useProjectAlertIncidentsInRange } from "../../../../../../domains/alerts/alerts.collection.ts"
import { IncidentMarkerPopover } from "../../../../../../domains/alerts/incident-marker-popover.tsx"
import { buildIncidentMarkers } from "../../../../../../domains/alerts/incident-markers.ts"
import { useIncidentBucketHoverPopover } from "../../../../../../domains/alerts/use-incident-bucket-hover-popover.ts"
import { metricOptionId, targetMetricOptions } from "../../../../../../domains/monitors/monitor-target.ts"
import { useMonitorMetricSeries } from "../../../../../../domains/monitors/monitors.collection.ts"
import type { MonitorRecord } from "../../../../../../domains/monitors/monitors.functions.ts"

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const metricLabel = (target: NonNullable<MonitorRecord["target"]>): string => {
  const id = metricOptionId(target.metric)
  return targetMetricOptions(target.stream).find((option) => option.id === id)?.label ?? "Metric"
}

const formatBucketLabel = (startMs: number, bucketMs: number): string => {
  const date = new Date(startMs)
  if (bucketMs < DAY_MS) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

const formatBucketTooltipLabel = (startMs: number): string => new Date(startMs).toLocaleString()

/**
 * The monitor's tracked metric over the selected window, as a histogram with the
 * monitor's incidents overlaid (point markers + shaded ranges) and a per-bucket
 * incident hover popover. The chart's value axis is the metric in its own unit.
 */
export function MonitorMetricChart({
  projectId,
  projectSlug,
  monitor,
  fromMs,
  toMs,
  bucketMs,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly monitor: MonitorRecord
  readonly fromMs: number
  readonly toMs: number
  readonly bucketMs: number
}) {
  const target = monitor.target
  const metric: MonitorMetric | null = target?.metric ?? null

  const { series, isLoading } = useMonitorMetricSeries({
    projectId,
    monitorSlug: monitor.slug,
    fromMs,
    toMs,
    bucketMs,
    enabled: target !== null,
  })

  const { data: incidents } = useProjectAlertIncidentsInRange({
    projectId,
    fromIso: new Date(fromMs).toISOString(),
    toIso: new Date(toMs).toISOString(),
    enabled: target !== null,
  })
  // Project-wide query, narrowed to this monitor's incidents (works for unified, saved-search and issue monitors).
  const monitorIncidents = useMemo(
    () => incidents.filter((incident) => incident.monitorSlug === monitor.slug),
    [incidents, monitor.slug],
  )

  const chartData = useMemo(
    () =>
      (series?.values ?? []).map((value, index) => ({
        category: formatBucketLabel(series?.bucketStartsMs[index] ?? fromMs, bucketMs),
        tooltipCategory: formatBucketTooltipLabel(series?.bucketStartsMs[index] ?? fromMs),
        value,
      })),
    [series, bucketMs, fromMs],
  )

  const { overlay, incidentsTouchingBucketIndex } = useMemo(() => {
    if (!series || monitorIncidents.length === 0) {
      return { overlay: undefined, incidentsTouchingBucketIndex: new Map() }
    }
    const result = buildIncidentMarkers({
      bucketStartsMs: series.bucketStartsMs,
      bucketWidthMs: bucketMs,
      incidents: monitorIncidents,
      nowMs: toMs,
    })
    return { overlay: result.overlay, incidentsTouchingBucketIndex: result.incidentsTouchingBucketIndex }
  }, [series, monitorIncidents, bucketMs, toMs])

  const {
    popover,
    popoverIncidents,
    handleBucketAxisPointerChange,
    onOpenChange: onPopoverOpenChange,
    onContentMouseEnter,
    onContentMouseLeave,
  } = useIncidentBucketHoverPopover({ incidentsTouchingBucketIndex })

  const formatTooltip = useCallback(
    (category: string, value: number) =>
      metric ? `${category}<br/><b>${formatMetricValue(value, metric)}</b>` : `${category}<br/><b>${value}</b>`,
    [metric],
  )

  const latestValue = series && series.values.length > 0 ? series.values[series.values.length - 1] : null
  const hasData = (series?.values ?? []).some((value) => value > 0) || monitorIncidents.length > 0

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4">
      <div className="flex items-baseline justify-between gap-2">
        <Text.H6 color="foregroundMuted">{target ? metricLabel(target) : "Metric"}</Text.H6>
        {latestValue !== null && metric ? (
          <Text.H5 color="foreground" className="tabular-nums">
            {formatMetricValue(latestValue, metric)}
            <Text.H6 color="foregroundMuted" asChild>
              <span> latest</span>
            </Text.H6>
          </Text.H5>
        ) : null}
      </div>

      {isLoading ? (
        <HistogramSkeleton height={200} />
      ) : !hasData ? (
        <div className="flex min-h-[120px] items-center justify-center">
          <Text.H6 color="foregroundMuted">No activity in this window</Text.H6>
        </div>
      ) : (
        <BarChart
          data={chartData}
          height={200}
          showYAxis
          xAxisLabelFontSize={10}
          ariaLabel={`${target ? metricLabel(target) : "Metric"} over time`}
          formatTooltip={formatTooltip}
          {...(overlay ? { overlay } : {})}
          onBucketAxisPointerChange={handleBucketAxisPointerChange}
        />
      )}

      <IncidentMarkerPopover
        open={popover !== null}
        anchor={popover?.anchor ?? null}
        incidents={popoverIncidents}
        projectSlug={projectSlug}
        onOpenChange={onPopoverOpenChange}
        onContentMouseEnter={onContentMouseEnter}
        onContentMouseLeave={onContentMouseLeave}
      />
    </section>
  )
}
