import { Chart, type ChartSeries, EmptyState, HistogramSkeleton, Text } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { type AdminProjectMetricsDto, adminGetProjectMetrics } from "../../../../domains/admin/projects.functions.ts"
import { DashboardSection, DashboardSplit } from "../../-components/dashboard/index.ts"
import { TopSignalsTable } from "./top-issues-table.tsx"

const CHART_HEIGHT = 200

// Series colours. Hardcoded HSL strings rather than CSS variables —
// the chart-theme module only exposes a handful of tokens, and these
// values keep series visually distinct in both light and dark mode.
const TRACE_LINE_COLOR = "hsl(217 91% 60%)"
const ANNOTATION_PASSED_COLOR = "hsl(142 60% 45%)"
const ANNOTATION_FAILED_COLOR = "hsl(0 70% 55%)"
const SIGNAL_LAYER_COLORS = {
  resolved: "hsl(142 60% 45%)",
  tracked: "hsl(217 91% 60%)",
  untracked: "hsl(25 90% 55%)",
} as const

function formatBucketLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: "numeric", day: "numeric" })
}

function formatBucketTooltip(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

interface MetricsSectionProps {
  readonly projectId: string
}

export function MetricsSection({ projectId }: MetricsSectionProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["backoffice", "project-metrics", projectId],
    queryFn: () => adminGetProjectMetrics({ data: { projectId } }),
    staleTime: 60_000,
  })

  if (isError) {
    return (
      <DashboardSection title="Activity (last 30 days)">
        <div className="flex min-h-[120px] items-center justify-center">
          <Text.H6 color="destructive">Could not load metrics.</Text.H6>
        </div>
      </DashboardSection>
    )
  }

  if (isLoading || !data) {
    return (
      <>
        <DashboardSection title="Activity (last 30 days)">
          <HistogramSkeleton height={CHART_HEIGHT} />
        </DashboardSection>
        <DashboardSplit
          ratio="wide-primary"
          primary={
            <DashboardSection title="Top issues">
              <HistogramSkeleton height={CHART_HEIGHT} />
            </DashboardSection>
          }
          secondary={
            <DashboardSection title="Signals over time">
              <HistogramSkeleton height={CHART_HEIGHT} />
            </DashboardSection>
          }
        />
      </>
    )
  }

  return (
    <>
      <DashboardSection title="Activity (last 30 days)">
        <ActivityChart activity={data.activity} />
      </DashboardSection>
      <DashboardSplit
        ratio="wide-primary"
        primary={
          <DashboardSection title="Top issues" count={data.topSignals.length}>
            <TopSignalsTable issues={data.topSignals} />
          </DashboardSection>
        }
        secondary={
          <DashboardSection title="Signals over time">
            <SignalsLifecycleChart points={data.signalsLifecycle} />
          </DashboardSection>
        }
      />
    </>
  )
}

function ActivityChart({ activity }: { readonly activity: AdminProjectMetricsDto["activity"] }) {
  const categories = useMemo(() => activity.map((p) => formatBucketLabel(p.bucketStart)), [activity])

  const series = useMemo<ChartSeries[]>(
    () => [
      {
        kind: "line",
        name: "Traces",
        values: activity.map((p) => p.traceCount),
        color: TRACE_LINE_COLOR,
        axis: "left",
      },
      {
        kind: "bar",
        name: "Positive annotations",
        values: activity.map((p) => p.annotationsPassed),
        color: ANNOTATION_PASSED_COLOR,
        axis: "right",
        stack: "annotations",
      },
      {
        kind: "bar",
        name: "Negative annotations",
        values: activity.map((p) => p.annotationsFailed),
        color: ANNOTATION_FAILED_COLOR,
        axis: "right",
        stack: "annotations",
      },
    ],
    [activity],
  )

  const tooltipTitle = useMemo(
    () =>
      (_label: string, dataIndex: number): string => {
        const point = activity[dataIndex]
        return point ? formatBucketTooltip(point.bucketStart) : ""
      },
    [activity],
  )

  const isEmpty = activity.every((p) => p.traceCount === 0 && p.annotationsPassed === 0 && p.annotationsFailed === 0)

  if (isEmpty) {
    return <EmptyState message="No activity in this window." />
  }

  return (
    <Chart
      categories={categories}
      series={series}
      height={CHART_HEIGHT}
      tooltipTitle={tooltipTitle}
      ariaLabel="Project activity over the last 30 days"
    />
  )
}

function SignalsLifecycleChart({ points }: { readonly points: AdminProjectMetricsDto["signalsLifecycle"] }) {
  const categories = useMemo(() => points.map((p) => formatBucketLabel(p.bucketStart)), [points])

  const series = useMemo<ChartSeries[]>(
    () => [
      // Bottom-first stacking order: resolved baseline at the bottom,
      // active layers on top so day-to-day movement is most visible at
      // the top edge of the band.
      {
        kind: "line",
        name: "Resolved",
        values: points.map((p) => p.resolved),
        color: SIGNAL_LAYER_COLORS.resolved,
        area: true,
        stack: "issues",
      },
      {
        kind: "line",
        name: "Tracked",
        values: points.map((p) => p.tracked),
        color: SIGNAL_LAYER_COLORS.tracked,
        area: true,
        stack: "issues",
      },
      {
        kind: "line",
        name: "Untracked",
        values: points.map((p) => p.untracked),
        color: SIGNAL_LAYER_COLORS.untracked,
        area: true,
        stack: "issues",
      },
    ],
    [points],
  )

  const tooltipTitle = useMemo(
    () =>
      (_label: string, dataIndex: number): string => {
        const point = points[dataIndex]
        return point ? formatBucketTooltip(point.bucketStart) : ""
      },
    [points],
  )

  if (points.every((p) => p.untracked === 0 && p.tracked === 0 && p.resolved === 0)) {
    return <EmptyState message="No issues yet." />
  }

  return (
    <Chart
      categories={categories}
      series={series}
      height={CHART_HEIGHT}
      tooltipTitle={tooltipTitle}
      ariaLabel="Signals lifecycle over the last 30 days"
    />
  )
}
