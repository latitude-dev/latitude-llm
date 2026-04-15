import type { FilterSet } from "@domain/shared"
import { Badge, type BadgeProps, Skeleton, Text } from "@repo/ui"
import { formatCount, formatDuration, formatPrice } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { useTraceMetrics, useTracesCount } from "../../../../../../domains/traces/traces.collection.ts"
import { countTracesByProject, getTraceMetricsByProject } from "../../../../../../domains/traces/traces.functions.ts"
import { Histogram } from "../../-components/aggregations/histogram.tsx"

type TrendTone = "neutral" | "positive" | "negative"

function trendBadgeVariant(tone: TrendTone): BadgeProps["variant"] {
  if (tone === "positive") return "outlineSuccessMuted"
  if (tone === "negative") return "outlineDestructiveMuted"
  return "outlineMuted"
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
    <div className="flex min-w-[176px] max-w-[200px] shrink-0 basis-[176px] flex-col gap-1.5">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
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
        <Badge variant="outlineMuted" size="small" title={trend?.full}>
          {trendAwaitingCompare ? "…" : "—"}
        </Badge>
      ) : (
        <Badge variant={trendBadgeVariant(trendTone)} size="small" title={trend.full} className="w-fit">
          {trend.short}
        </Badge>
      )}
    </div>
  )
}

const ERROR_STATUS_FILTER: FilterSet = {
  status: [{ op: "in", value: ["error"] }],
}

function mergeFilters(a: FilterSet, b: FilterSet): FilterSet {
  return { ...a, ...b }
}

export function ProjectHomeTracePanel({
  projectId,
  currentRange,
  compareFilters,
}: {
  readonly projectId: string
  readonly currentRange: FilterSet
  readonly compareFilters: FilterSet
}) {
  const errorRange = useMemo(() => mergeFilters(currentRange, ERROR_STATUS_FILTER), [currentRange])
  const previousErrorRange = useMemo(() => mergeFilters(compareFilters, ERROR_STATUS_FILTER), [compareFilters])

  const { data: traceMetrics, isLoading: metricsLoading } = useTraceMetrics({
    projectId,
    filters: currentRange,
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
  const totalCostStr = traceMetrics ? formatPrice(traceMetrics.costTotalMicrocents.sum / 100_000_000) : dash
  const medianDurationStr = traceMetrics ? formatDuration(traceMetrics.durationNs.median) : dash
  const totalTokensStr = traceMetrics ? formatCount(traceMetrics.tokensTotal.sum) : dash
  const totalSpansStr = traceMetrics ? formatCount(traceMetrics.spanCount.sum) : dash
  const errorRate = traceCount > 0 ? (errorTraceCount / traceCount) * 100 : 0
  const prevErrorRate = prevTraceCount > 0 ? (prevErrorTraceCount / prevTraceCount) * 100 : 0

  const showTtftAggregations = traceMetrics && traceMetrics.timeToFirstTokenNs.max > 0

  const trendAwaitingCompare = prevTraceFetching || prevMetricsFetching || prevErrorFetching

  const tracesTrend = countRatioTrendShortFull(traceCount, prevTraceCount)
  const tracesTone: TrendTone =
    prevTraceCount > 0
      ? traceCount < prevTraceCount
        ? "positive"
        : traceCount > prevTraceCount
          ? "negative"
          : "neutral"
      : "neutral"

  const costTrend =
    traceMetrics && prevTraceMetrics && !prevMetricsFetching
      ? countRatioTrendShortFull(traceMetrics.costTotalMicrocents.sum, prevTraceMetrics.costTotalMicrocents.sum)
      : null
  const costTone: TrendTone =
    traceMetrics && prevTraceMetrics && !prevMetricsFetching
      ? traceMetrics.costTotalMicrocents.sum < prevTraceMetrics.costTotalMicrocents.sum
        ? "positive"
        : traceMetrics.costTotalMicrocents.sum > prevTraceMetrics.costTotalMicrocents.sum
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

  const tokensTrend =
    traceMetrics && prevTraceMetrics && !prevMetricsFetching
      ? countRatioTrendShortFull(traceMetrics.tokensTotal.sum, prevTraceMetrics.tokensTotal.sum)
      : null
  const tokensTone: TrendTone =
    traceMetrics && prevTraceMetrics && !prevMetricsFetching
      ? traceMetrics.tokensTotal.sum < prevTraceMetrics.tokensTotal.sum
        ? "positive"
        : traceMetrics.tokensTotal.sum > prevTraceMetrics.tokensTotal.sum
          ? "negative"
          : "neutral"
      : "neutral"

  const spansTrend =
    traceMetrics && prevTraceMetrics && !prevMetricsFetching
      ? countRatioTrendShortFull(traceMetrics.spanCount.sum, prevTraceMetrics.spanCount.sum)
      : null
  const spansTone: TrendTone =
    traceMetrics && prevTraceMetrics && !prevMetricsFetching
      ? traceMetrics.spanCount.sum < prevTraceMetrics.spanCount.sum
        ? "positive"
        : traceMetrics.spanCount.sum > prevTraceMetrics.spanCount.sum
          ? "negative"
          : "neutral"
      : "neutral"

  const errorTrend = errorRateDeltaShortFull(errorRate, prevErrorRate)
  const errorTone: TrendTone =
    errorRate > prevErrorRate ? "negative" : errorRate < prevErrorRate ? "positive" : "neutral"

  const ttftTrend =
    traceMetrics && prevTraceMetrics && !prevMetricsFetching && showTtftAggregations
      ? latencyDeltaShortFull(traceMetrics.timeToFirstTokenNs.median, prevTraceMetrics.timeToFirstTokenNs.median)
      : null
  const ttftTone: TrendTone =
    traceMetrics && prevTraceMetrics && !prevMetricsFetching && showTtftAggregations
      ? traceMetrics.timeToFirstTokenNs.median < prevTraceMetrics.timeToFirstTokenNs.median
        ? "positive"
        : traceMetrics.timeToFirstTokenNs.median > prevTraceMetrics.timeToFirstTokenNs.median
          ? "negative"
          : "neutral"
      : "neutral"

  return (
    <div className="flex flex-col rounded-lg bg-secondary p-2">
      <div className="flex flex-row flex-wrap gap-3 p-4">
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
          label="Total cost"
          value={totalCostStr}
          trend={costTrend}
          trendTone={costTone}
          isLoading={loading}
          trendAwaitingCompare={trendAwaitingCompare}
          skeletonWidthClassName="w-20"
        />
        <TraceMetricWithTrend
          label="Median duration"
          value={medianDurationStr}
          trend={durationTrend}
          trendTone={durationTone}
          isLoading={loading}
          trendAwaitingCompare={trendAwaitingCompare}
          skeletonWidthClassName="w-20"
        />
        <TraceMetricWithTrend
          label="Total tokens"
          value={totalTokensStr}
          trend={tokensTrend}
          trendTone={tokensTone}
          isLoading={loading}
          trendAwaitingCompare={trendAwaitingCompare}
          skeletonWidthClassName="w-20"
        />
        {showTtftAggregations ? (
          <TraceMetricWithTrend
            label="Median time to first token"
            value={formatDuration(traceMetrics.timeToFirstTokenNs.median)}
            trend={ttftTrend}
            trendTone={ttftTone}
            isLoading={loading}
            trendAwaitingCompare={trendAwaitingCompare}
            skeletonWidthClassName="w-24"
          />
        ) : null}
        <TraceMetricWithTrend
          label="Total spans"
          value={totalSpansStr}
          trend={spansTrend}
          trendTone={spansTone}
          isLoading={loading}
          trendAwaitingCompare={trendAwaitingCompare}
          skeletonWidthClassName="w-16"
        />
      </div>
      <Histogram projectId={projectId} filters={currentRange} />
    </div>
  )
}

function formatRatioPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0%"
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}
