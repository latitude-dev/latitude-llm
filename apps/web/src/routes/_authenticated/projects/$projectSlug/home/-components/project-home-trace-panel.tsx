import type { FilterSet } from "@domain/shared"
import { Badge, type BadgeProps, Button, Skeleton, Text } from "@repo/ui"
import { formatCount, formatDuration } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Activity } from "lucide-react"
import { useMemo } from "react"
import { useIssues } from "../../../../../../domains/issues/issues.collection.ts"
import { useTraceMetrics, useTracesCount } from "../../../../../../domains/traces/traces.collection.ts"
import { countTracesByProject, getTraceMetricsByProject } from "../../../../../../domains/traces/traces.functions.ts"
import { Histogram } from "../../-components/aggregations/histogram.tsx"
import { ProjectHomeSectionBlankSlate } from "./project-home-section-blank-slate.tsx"

type TrendTone = "neutral" | "positive" | "negative"

function trendBadgeVariant(tone: TrendTone): BadgeProps["variant"] {
  if (tone === "positive") return "successMuted"
  if (tone === "negative") return "destructiveMuted"
  return "muted"
}

function countRatioTrendShortFull(
  current: number,
  previous: number,
): { readonly short: string; readonly full: string } {
  if (previous <= 0) {
    return current > 0 ? { short: "New", full: "New vs prior 7 days" } : { short: "—", full: "No data in prior 7 days" }
  }
  const pct = ((current - previous) / previous) * 100
  const sign = pct > 0 ? "+" : ""
  const short = `${sign}${pct.toFixed(0)}%`
  return { short, full: `${short} vs prior 7 days` }
}

function errorRateDeltaShortFull(
  currentRate: number,
  previousRate: number,
): {
  readonly short: string
  readonly full: string
} {
  const d = currentRate - previousRate
  const sign = d > 0 ? "+" : ""
  const short = `${sign}${d.toFixed(1)}pp`
  return { short, full: `${short} vs prior 7 days` }
}

function latencyDeltaShortFull(
  currentNs: number,
  previousNs: number,
): { readonly short: string; readonly full: string } {
  const deltaMs = (currentNs - previousNs) / 1_000_000
  if (!Number.isFinite(deltaMs) || Math.abs(deltaMs) < 1) {
    return { short: "Flat", full: "Flat vs prior 7 days" }
  }
  const sign = deltaMs > 0 ? "+" : "−"
  const abs = formatDuration(Math.abs(deltaMs) * 1_000_000)
  const short = `${sign}${abs}`
  return { short, full: `${short} vs prior 7 days` }
}

function TraceMetricWithTrend({
  label,
  value,
  trend,
  trendTone,
  isLoading,
  trendAwaitingCompare,
  skeletonWidthClassName = "w-16",
}: {
  readonly label: string
  readonly value: string
  readonly trend: { readonly short: string; readonly full: string } | null
  readonly trendTone: TrendTone
  readonly isLoading?: boolean
  readonly trendAwaitingCompare?: boolean
  readonly skeletonWidthClassName?: string
}) {
  return (
    <div className="flex min-w-[176px] max-w-[220px] shrink-0 basis-[176px] flex-col gap-1.5">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <div className="flex min-w-0 flex-row items-center gap-2">
        {isLoading ? (
          <Skeleton className={`h-5 ${skeletonWidthClassName}`} />
        ) : (
          <Text.H5 color="foreground" className="tabular-nums">
            {value}
          </Text.H5>
        )}
        {isLoading ? (
          <Skeleton className="h-5 w-14 rounded-md" />
        ) : trendAwaitingCompare || !trend ? (
          <Badge variant="muted" size="small" title={trend?.full}>
            {trendAwaitingCompare ? "…" : "—"}
          </Badge>
        ) : (
          <Badge variant={trendBadgeVariant(trendTone)} size="small" title={trend.full} className="w-fit">
            {trend.short}
          </Badge>
        )}
      </div>
    </div>
  )
}

const ERROR_STATUS_FILTER: FilterSet = {
  status: [{ op: "in", value: ["error"] }],
}

function mergeFilters(a: FilterSet, b: FilterSet): FilterSet {
  return { ...a, ...b }
}

function timeRangeFromFilters(filters: FilterSet):
  | {
      readonly fromIso?: string
      readonly toIso?: string
    }
  | undefined {
  const startTime = filters.startTime
  if (!startTime?.length) return undefined
  const gte = startTime.find((condition) => condition.op === "gte")
  const lte = startTime.find((condition) => condition.op === "lte")
  if (!gte?.value && !lte?.value) return undefined
  return {
    ...(gte?.value ? { fromIso: String(gte.value) } : {}),
    ...(lte?.value ? { toIso: String(lte.value) } : {}),
  }
}

export function ProjectHomeTracePanel({
  projectId,
  projectSlug,
  currentRange,
  compareFilters,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly currentRange: FilterSet
  readonly compareFilters: FilterSet
}) {
  const errorRange = useMemo(() => mergeFilters(currentRange, ERROR_STATUS_FILTER), [currentRange])
  const previousErrorRange = useMemo(() => mergeFilters(compareFilters, ERROR_STATUS_FILTER), [compareFilters])

  const { data: traceMetrics, isLoading: metricsLoading } = useTraceMetrics({
    projectId,
    filters: currentRange,
  })
  const currentIssuesTimeRange = useMemo(() => timeRangeFromFilters(currentRange), [currentRange])
  const compareIssuesTimeRange = useMemo(() => timeRangeFromFilters(compareFilters), [compareFilters])

  const { totalCount: activeIssueCount, isLoading: activeIssueLoading } = useIssues({
    projectId,
    lifecycleGroup: "active",
    sorting: { column: "occurrences", direction: "desc" },
    limit: 1,
    ...(currentIssuesTimeRange ? { timeRange: currentIssuesTimeRange } : {}),
  })
  const { totalCount: prevActiveIssueCount, isLoading: prevActiveIssueLoading } = useIssues({
    projectId,
    lifecycleGroup: "active",
    sorting: { column: "occurrences", direction: "desc" },
    limit: 1,
    ...(compareIssuesTimeRange ? { timeRange: compareIssuesTimeRange } : {}),
  })

  const { totalCount: traceCount, isLoading: countLoading } = useTracesCount({
    projectId,
    filters: currentRange,
  })
  const { totalCount: errorTraceCount, isLoading: errorCountLoading } = useTracesCount({
    projectId,
    filters: errorRange,
  })

  const { data: prevTraceCount = 0, isFetching: prevTraceFetching } = useQuery({
    queryKey: ["traces-count", projectId, compareFilters],
    queryFn: () => countTracesByProject({ data: { projectId, filters: compareFilters } }),
    staleTime: 30_000,
    enabled: projectId.length > 0,
  })
  const { data: prevErrorTraceCount = 0, isFetching: prevErrorFetching } = useQuery({
    queryKey: ["traces-count-error", projectId, previousErrorRange],
    queryFn: () => countTracesByProject({ data: { projectId, filters: previousErrorRange } }),
    staleTime: 30_000,
    enabled: projectId.length > 0,
  })
  const { data: prevTraceMetrics, isFetching: prevMetricsFetching } = useQuery({
    queryKey: ["traces-metrics", projectId, compareFilters],
    queryFn: () => getTraceMetricsByProject({ data: { projectId, filters: compareFilters } }),
    staleTime: 30_000,
    enabled: projectId.length > 0,
  })

  const loading = metricsLoading || countLoading
  const dash = "—"
  const traceCountStr = formatCount(traceCount)
  const medianDurationStr = traceMetrics ? formatDuration(traceMetrics.durationNs.median) : dash
  const errorRate = traceCount > 0 ? (errorTraceCount / traceCount) * 100 : 0
  const prevErrorRate = prevTraceCount > 0 ? (prevErrorTraceCount / prevTraceCount) * 100 : 0

  const trendAwaitingCompare = prevTraceFetching || prevMetricsFetching || prevErrorFetching || prevActiveIssueLoading

  const tracesTrend = countRatioTrendShortFull(traceCount, prevTraceCount)
  const tracesTone: TrendTone =
    prevTraceCount > 0
      ? traceCount < prevTraceCount
        ? "positive"
        : traceCount > prevTraceCount
          ? "negative"
          : "neutral"
      : "neutral"

  const durationTrend =
    traceMetrics && prevTraceMetrics && !prevMetricsFetching
      ? latencyDeltaShortFull(traceMetrics.durationNs.median, prevTraceMetrics.durationNs.median)
      : null
  const durationTone: TrendTone =
    traceMetrics && prevTraceMetrics && !prevMetricsFetching
      ? traceMetrics.durationNs.median < prevTraceMetrics.durationNs.median
        ? "positive"
        : traceMetrics.durationNs.median > prevTraceMetrics.durationNs.median
          ? "negative"
          : "neutral"
      : "neutral"

  const errorTrend = errorRateDeltaShortFull(errorRate, prevErrorRate)
  const errorTone: TrendTone =
    errorRate > prevErrorRate ? "negative" : errorRate < prevErrorRate ? "positive" : "neutral"
  const activeIssuesTrend = countRatioTrendShortFull(activeIssueCount, prevActiveIssueCount)
  const activeIssuesTone: TrendTone =
    prevActiveIssueCount > 0
      ? activeIssueCount < prevActiveIssueCount
        ? "positive"
        : activeIssueCount > prevActiveIssueCount
          ? "negative"
          : "neutral"
      : "neutral"

  return (
    <div className="flex flex-col rounded-lg bg-secondary p-2">
      <div className="flex flex-row gap-4 p-4">
        <div className="flex min-w-0 flex-1 flex-row flex-wrap gap-3">
          <TraceMetricWithTrend
            label="Traces"
            value={traceCountStr}
            trend={tracesTrend}
            trendTone={tracesTone}
            isLoading={countLoading}
            trendAwaitingCompare={trendAwaitingCompare}
            skeletonWidthClassName="w-16"
          />
          <TraceMetricWithTrend
            label="Error rate"
            value={formatRatioPercent(errorTraceCount, traceCount)}
            trend={errorTrend}
            trendTone={errorTone}
            isLoading={errorCountLoading || countLoading}
            trendAwaitingCompare={trendAwaitingCompare}
            skeletonWidthClassName="w-14"
          />
          <TraceMetricWithTrend
            label="Median latency"
            value={medianDurationStr}
            trend={durationTrend}
            trendTone={durationTone}
            isLoading={loading}
            trendAwaitingCompare={trendAwaitingCompare}
            skeletonWidthClassName="w-20"
          />
          <TraceMetricWithTrend
            label="Active issues"
            value={formatCount(activeIssueCount)}
            trend={activeIssuesTrend}
            trendTone={activeIssuesTone}
            isLoading={activeIssueLoading}
            trendAwaitingCompare={trendAwaitingCompare}
            skeletonWidthClassName="w-16"
          />
        </div>
        <div className="shrink-0 self-start">
          <Button variant="outline" size="sm" asChild>
            <Link to="/projects/$projectSlug/" params={{ projectSlug }}>
              View traces
            </Link>
          </Button>
        </div>
      </div>
      <Histogram
        projectId={projectId}
        filters={currentRange}
        emptyContent={
          <ProjectHomeSectionBlankSlate
            icon={Activity}
            title="No traces in the last 7 days"
            description="Once your app sends traces, volume and timing will show up here."
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to="/projects/$projectSlug/" params={{ projectSlug }}>
                  View traces
                </Link>
              </Button>
            }
          />
        }
      />
    </div>
  )
}

function formatRatioPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0%"
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}
