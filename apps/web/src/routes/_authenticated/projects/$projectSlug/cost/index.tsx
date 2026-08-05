import { Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"
import { TimeFilterDropdown } from "../../../../../components/time-filter-dropdown.tsx"
import {
  useCacheEconomics,
  useCostBreakdown,
  useCostOverview,
  useCostPerSessionDecomposition,
  useCostSeries,
  useModelUsageSeries,
} from "../../../../../domains/cost/cost.collection.ts"
import { useFeatureFlagGate } from "../../../../../domains/feature-flags/feature-flags.collection.ts"
import { useAnalyticsTimeWindow } from "../../../../../domains/projects/use-analytics-time-window.ts"
import { useProjectFirstTraceAt, useProjectLastTraceAt } from "../../../../../domains/traces/traces.collection.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../-route-data.ts"
import { CacheEconomicsPanel } from "./-components/cache-economics-panel.tsx"
import { CostBreakdownPanel } from "./-components/cost-breakdown-panel.tsx"
import { CostConfidenceStrip } from "./-components/cost-confidence-strip.tsx"
import {
  computeDailyAverageMicrocents,
  densifyCostBuckets,
  densifyModelUsageBuckets,
  isCostBreakdownDimension,
  isCostSeriesMetric,
  isModelUsageMeasure,
  pickCostBucketSeconds,
  resolveIncompleteBucketIndex,
} from "./-components/cost-formatters.ts"
import { CostKpiRow } from "./-components/cost-kpi-row.tsx"
import { CostOverTimePanel } from "./-components/cost-over-time-panel.tsx"
import { CostPerSessionPanel } from "./-components/cost-per-session-panel.tsx"
import { ModelImpactPanel } from "./-components/model-impact-panel.tsx"
import { ModelUsagePanel } from "./-components/model-usage-panel.tsx"

function CostBreadcrumb() {
  return <BreadcrumbText variant="current">Cost</BreadcrumbText>
}

/** Groups the panels below it. Sits outside the cards, above their own titles. */
function SectionHeading({ children }: { readonly children: string }) {
  return (
    // Pulled toward the panel it introduces, so the stack's own gap reads as the break
    // between sections rather than splitting the heading off from its own content.
    <div className="-mb-2 flex flex-col pt-2">
      <Text.H5M color="foreground">{children}</Text.H5M>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/cost/")({
  staticData: {
    breadcrumb: CostBreadcrumb,
  },
  component: CostPageContent,
})

function CostPageContent() {
  const project = useRouteProject()
  const { firstTraceAt } = useProjectFirstTraceAt({ projectId: project.id })
  const { lastTraceAt } = useProjectLastTraceAt({ projectId: project.id })
  const tw = useAnalyticsTimeWindow({
    project,
    fromKey: "costTimeFrom",
    toKey: "costTimeTo",
    allTimeLowerBoundIso: firstTraceAt,
    lastActivityIso: lastTraceAt,
  })
  const [metric, setMetric] = useParamState("costMetric", "total", { validate: isCostSeriesMetric })
  const [dimension, setDimension] = useParamState("costDimension", "model", { validate: isCostBreakdownDimension })
  const [usageMeasure, setUsageMeasure] = useParamState("costUsage", "cost", { validate: isModelUsageMeasure })
  const costDashboard = useFeatureFlagGate("costDashboard")

  // One window for the KPIs and the chart, so the two can be reconciled.
  const range = useMemo(
    () =>
      tw.isAllTime
        ? tw.trendRange
        : { fromIso: tw.listRange.fromIso ?? tw.trendRange.fromIso, toIso: tw.listRange.toIso },
    [tw.isAllTime, tw.listRange, tw.trendRange],
  )
  const bucketSeconds = useMemo(
    () => pickCostBucketSeconds(Date.parse(range.toIso) - Date.parse(range.fromIso)),
    [range],
  )

  const enabled = costDashboard.isEnabled
  const { data: overview, isLoading: overviewLoading } = useCostOverview({ projectId: project.id, range, enabled })
  const { data: series = [], isLoading: seriesLoading } = useCostSeries({
    projectId: project.id,
    range,
    metric,
    bucketSeconds,
    enabled,
  })
  // Same query key as above while `total` is selected, so the toggle costs no
  // second request in the common case.
  const { data: totalSeries = [], isLoading: totalSeriesLoading } = useCostSeries({
    projectId: project.id,
    range,
    metric: "total",
    bucketSeconds,
    enabled,
  })
  const { data: modelUsage, isLoading: modelUsageLoading } = useModelUsageSeries({
    projectId: project.id,
    range,
    bucketSeconds,
    enabled,
  })
  const { data: perSession, isLoading: perSessionLoading } = useCostPerSessionDecomposition({
    projectId: project.id,
    range,
    bucketSeconds,
    enabled,
  })
  const { data: cacheEconomics, isLoading: cacheEconomicsLoading } = useCacheEconomics({
    projectId: project.id,
    range,
    enabled,
  })
  const { data: breakdown, isLoading: breakdownLoading } = useCostBreakdown({
    projectId: project.id,
    range,
    dimension,
    enabled,
  })
  // The impact panel is about models whichever dimension the table below is showing.
  // Same query key as above while the Model tab is selected, so that costs no request.
  const { data: modelBreakdown, isLoading: modelBreakdownLoading } = useCostBreakdown({
    projectId: project.id,
    range,
    dimension: "model",
    enabled,
  })

  const buckets = useMemo(
    () => densifyCostBuckets({ buckets: series, ...range, bucketSeconds }),
    [series, range, bucketSeconds],
  )
  const provisionalIndex = useMemo(
    () => resolveIncompleteBucketIndex({ buckets, bucketSeconds, toIso: range.toIso, nowMs: Date.now() }),
    [buckets, bucketSeconds, range.toIso],
  )
  const denseModelUsage = useMemo(
    () =>
      modelUsage
        ? { ...modelUsage, buckets: densifyModelUsageBuckets({ buckets: modelUsage.buckets, ...range, bucketSeconds }) }
        : undefined,
    [modelUsage, range, bucketSeconds],
  )
  const modelUsageProvisionalIndex = useMemo(
    () =>
      resolveIncompleteBucketIndex({
        buckets: denseModelUsage?.buckets ?? [],
        bucketSeconds,
        toIso: range.toIso,
        nowMs: Date.now(),
      }),
    [denseModelUsage, bucketSeconds, range.toIso],
  )
  const dailyAverageMicrocents = useMemo(
    () => computeDailyAverageMicrocents({ buckets: totalSeries, bucketSeconds, ...range, nowMs: Date.now() }),
    [totalSeries, bucketSeconds, range],
  )

  if (costDashboard.isLoading || !enabled) {
    return (
      <Layout>
        <div className="flex min-h-[240px] items-center justify-center px-6">
          {costDashboard.isLoading ? null : (
            <Text.H5 color="foregroundMuted">Cost is not available for this organization yet.</Text.H5>
          )}
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <Layout.Header
        title="Cost dashboard"
        description="Optimize your spending"
        actions={
          <TimeFilterDropdown
            {...(tw.pickerStartFrom ? { startTimeFrom: tw.pickerStartFrom } : {})}
            {...(tw.pickerStartTo ? { startTimeTo: tw.pickerStartTo } : {})}
            onChange={tw.onTimeChange}
            // Unlike the other sections, every figure here is clamped to the recent
            // slice, so an unset range is not all time.
            placeholder="Recent activity"
          />
        }
      />
      <div className="flex flex-col gap-6 px-6 pb-6">
        <CostKpiRow
          overview={overview}
          dailyAverageMicrocents={dailyAverageMicrocents}
          bucketSeconds={bucketSeconds}
          isLoading={overviewLoading || seriesLoading || totalSeriesLoading}
        />
        <CostOverTimePanel
          buckets={buckets}
          metric={metric}
          onMetricChange={setMetric}
          bucketSeconds={bucketSeconds}
          provisionalIndex={provisionalIndex}
          rangeFromIso={range.fromIso}
          rangeToIso={range.toIso}
          isAllTime={tw.isAllTime}
          isLoading={seriesLoading}
        />
        <SectionHeading>Session</SectionHeading>
        <CostPerSessionPanel record={perSession} rangeFromIso={range.fromIso} isLoading={perSessionLoading} />
        <SectionHeading>Model</SectionHeading>
        {/* The two model questions side by side: how spend moves, and who it goes to. */}
        <div className="flex flex-col gap-2 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col">
            <ModelUsagePanel
              series={denseModelUsage}
              measure={usageMeasure}
              onMeasureChange={setUsageMeasure}
              bucketSeconds={bucketSeconds}
              provisionalIndex={modelUsageProvisionalIndex}
              rangeFromIso={range.fromIso}
              rangeToIso={range.toIso}
              isAllTime={tw.isAllTime}
              isLoading={modelUsageLoading}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <ModelImpactPanel
              breakdown={modelBreakdown}
              rangeFromIso={range.fromIso}
              rangeToIso={range.toIso}
              isAllTime={tw.isAllTime}
              isLoading={modelBreakdownLoading}
            />
          </div>
        </div>
        <SectionHeading>Cache</SectionHeading>
        <CacheEconomicsPanel economics={cacheEconomics} isLoading={cacheEconomicsLoading} />
        <CostBreakdownPanel
          breakdown={breakdown}
          dimension={dimension}
          onDimensionChange={setDimension}
          isLoading={breakdownLoading}
        />
        <CostConfidenceStrip confidence={overview?.confidence} isLoading={overviewLoading} />
      </div>
    </Layout>
  )
}
