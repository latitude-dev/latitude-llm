import { Chart, type ChartSeries, HistogramSkeleton, Text } from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { useMemo } from "react"
import {
  useMemoryActivityHistogram,
  useMemoryOverview,
  useStoreInsights,
} from "../../../../../../../domains/memories/memories.collection.ts"
import type { StoreInsightsRecord } from "../../../../../../../domains/memories/memories.functions.ts"
import { defaultProjectTimeWindowSeconds } from "../../../../../../../domains/projects/default-time-window.ts"
import { useAnalyticsTimeWindow } from "../../../../../../../domains/projects/use-analytics-time-window.ts"
import { useProjectFirstTraceAt, useProjectLastTraceAt } from "../../../../../../../domains/traces/traces.collection.ts"
import { TimeFilterDropdown } from "../../../-components/time-filter-dropdown.tsx"
import { useRouteProject } from "../../../-route-data.ts"
import { MemoryAnalyticsPanel, type MemoryTile } from "../../-components/memory-analytics-panel.tsx"
import {
  formatPercent,
  formatRatio,
  formatSignedCount,
  pickMemoryTrendBucketSeconds,
} from "../../-components/memory-formatters.ts"
import { recordDisplayLabel } from "../../-components/store-encoding.ts"
import { StoreInsightList } from "./store-insight-list.tsx"
import { StoreWriteHealthTable } from "./store-write-health-table.tsx"

const SIZE_BAR_COLOR = "hsl(217 91% 60%)"

function storeOverviewTiles(
  overview:
    | {
        readonly liveRecords: number
        readonly liveTokens: number
        readonly deadTokens: number
        readonly searches: number
        readonly zeroHitSearches: number
        readonly writes: number
        readonly recordsRetrieved: number
      }
    | undefined,
  netGrowthTokens: number | undefined,
): readonly MemoryTile[] {
  const o = overview
  return [
    { key: "records", label: "Records", value: formatCount(o?.liveRecords ?? 0) },
    {
      key: "tokens",
      label: "Total tokens",
      value: formatCount(o?.liveTokens ?? 0),
      ...(o && o.liveTokens > 0 ? { subtext: `${formatPercent(o.deadTokens / o.liveTokens)} dead` } : {}),
    },
    { key: "ratio", label: "Read:write", value: formatRatio(o?.recordsRetrieved ?? 0, o?.writes ?? 0) },
    {
      key: "searches",
      label: "Searches",
      value: formatCount(o?.searches ?? 0),
      ...(o && o.searches > 0 ? { subtext: `${formatPercent(o.zeroHitSearches / o.searches)} zero-hit` } : {}),
    },
    { key: "netGrowth", label: "Net growth", value: `${formatSignedCount(netGrowthTokens ?? 0)} tok` },
  ]
}

function mostReadItems(insights: StoreInsightsRecord | undefined) {
  const rows = insights?.mostReadRecords ?? []
  const max = rows[0]?.reads ?? 0
  return rows.map((row) => ({
    key: row.recordId,
    label: recordDisplayLabel(row.recordId),
    value: `${formatCount(row.reads)} reads`,
    fraction: max > 0 ? row.reads / max : 0,
    recordId: row.recordId,
  }))
}

function coldItems(insights: StoreInsightsRecord | undefined, nowMs: number) {
  const rows = insights?.coldRecords ?? []
  const idleOf = (lastReadAt: string | null) => (lastReadAt ? nowMs - Date.parse(lastReadAt) : Number.POSITIVE_INFINITY)
  const readIdles = rows.filter((row) => !row.neverRead).map((row) => idleOf(row.lastReadAt))
  const maxReadIdle = readIdles.length > 0 ? Math.max(...readIdles) : 0
  return rows.map((row) => ({
    key: row.recordId,
    label: recordDisplayLabel(row.recordId),
    value: row.neverRead ? "never read" : relativeTime(row.lastReadAt),
    fraction: row.neverRead ? 1 : maxReadIdle > 0 ? idleOf(row.lastReadAt) / maxReadIdle : 0,
    recordId: row.recordId,
  }))
}

function queryItems(rows: readonly { readonly queryText: string; readonly searches: number }[]) {
  const max = rows[0]?.searches ?? 0
  return rows.map((row, index) => ({
    key: `${index}:${row.queryText}`,
    label: row.queryText,
    value: `${formatCount(row.searches)} searches`,
    fraction: max > 0 ? row.searches / max : 0,
  }))
}

function largestItems(insights: StoreInsightsRecord | undefined) {
  const rows = insights?.largestRecords ?? []
  const max = rows[0]?.tokenCount ?? 0
  return rows.map((row) => ({
    key: row.recordId,
    label: recordDisplayLabel(row.recordId),
    value: `${formatCount(row.tokenCount)} tok`,
    fraction: max > 0 ? row.tokenCount / max : 0,
    recordId: row.recordId,
  }))
}

function SectionHeading({ children }: { readonly children: string }) {
  return <Text.H5>{children}</Text.H5>
}

function StatCallout({
  label,
  value,
  subtext,
}: {
  readonly label: string
  readonly value: string
  readonly subtext: string | undefined
}) {
  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <Text.H5 className="tabular-nums">{value}</Text.H5>
      {subtext ? <Text.H6 color="foregroundMuted">{subtext}</Text.H6> : null}
    </div>
  )
}

export function StoreHomeView({
  storeId,
  onSelectRecord,
}: {
  readonly storeId: string
  readonly onSelectRecord: (recordId: string) => void
}) {
  const project = useRouteProject()
  const { firstTraceAt } = useProjectFirstTraceAt({ projectId: project.id })
  const { lastTraceAt } = useProjectLastTraceAt({ projectId: project.id })
  const tw = useAnalyticsTimeWindow({
    project,
    fromKey: "storeTimeFrom",
    toKey: "storeTimeTo",
    allTimeLowerBoundIso: firstTraceAt,
    lastActivityIso: lastTraceAt,
  })

  const range = useMemo(
    () => ({ fromIso: tw.listRange.fromIso ?? tw.trendRange.fromIso, toIso: tw.listRange.toIso }),
    [tw.listRange, tw.trendRange],
  )
  // Mirror the Memory page: under All time, anchor the chart's right edge to
  // today and clamp the span to the project window so every day up to now shows.
  const histogramRange = useMemo(() => {
    if (!tw.isAllTime) return range
    const endMs = Date.parse(range.toIso)
    const spanMs = defaultProjectTimeWindowSeconds(project) * 1000
    const lowerBoundMs = Date.parse(range.fromIso)
    const startMs = Math.max(endMs - spanMs, Number.isFinite(lowerBoundMs) ? lowerBoundMs : endMs - spanMs)
    return { fromIso: new Date(startMs).toISOString(), toIso: range.toIso }
  }, [tw.isAllTime, range, project])
  const histogramBucketSeconds = useMemo(
    () => pickMemoryTrendBucketSeconds(Date.parse(histogramRange.toIso) - Date.parse(histogramRange.fromIso)),
    [histogramRange],
  )

  const { data: overview, isLoading: overviewLoading } = useMemoryOverview({ projectId: project.id, storeId, range })
  const { data: histogram = [], isLoading: histogramLoading } = useMemoryActivityHistogram({
    projectId: project.id,
    storeId,
    range: histogramRange,
    bucketSeconds: histogramBucketSeconds,
  })
  const { data: insights, isLoading: insightsLoading } = useStoreInsights({ projectId: project.id, storeId, range })

  const tiles = useMemo(() => storeOverviewTiles(overview, insights?.netGrowthTokens), [overview, insights])
  const mostRead = useMemo(() => mostReadItems(insights), [insights])
  const cold = useMemo(() => coldItems(insights, Date.now()), [insights])
  const topQueries = useMemo(() => queryItems(insights?.topQueries ?? []), [insights])
  const zeroHit = useMemo(() => queryItems(insights?.zeroHitQueries ?? []), [insights])
  const largest = useMemo(() => largestItems(insights), [insights])

  const sizeSeries = useMemo<readonly ChartSeries[]>(
    () => [
      {
        kind: "bar",
        name: "Records",
        values: (insights?.sizeDistribution ?? []).map((bucket) => bucket.count),
        color: SIZE_BAR_COLOR,
      },
    ],
    [insights],
  )
  const sizeCategories = useMemo(() => (insights?.sizeDistribution ?? []).map((bucket) => bucket.label), [insights])
  const sizeEmpty = (insights?.sizeDistribution ?? []).every((bucket) => bucket.count === 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-end">
          <TimeFilterDropdown
            {...(tw.pickerStartFrom ? { startTimeFrom: tw.pickerStartFrom } : {})}
            {...(tw.pickerStartTo ? { startTimeTo: tw.pickerStartTo } : {})}
            onChange={tw.onTimeChange}
          />
        </div>
        <MemoryAnalyticsPanel
          overview={overview}
          tiles={tiles}
          histogram={histogram}
          bucketSeconds={histogramBucketSeconds}
          rangeFromIso={histogramRange.fromIso}
          rangeToIso={histogramRange.toIso}
          isAllTime={tw.isAllTime}
          isLoading={overviewLoading || histogramLoading}
        />

        <div className="flex flex-col gap-3">
          <SectionHeading>What's used</SectionHeading>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <StoreInsightList
              title="Most-read records"
              items={mostRead}
              isLoading={insightsLoading}
              emptyText="No records retrieved in this window"
              mono
              onSelectRecord={onSelectRecord}
            />
            <StoreInsightList
              title="Cold storage"
              items={cold}
              isLoading={insightsLoading}
              emptyText="No live records"
              mono
              onSelectRecord={onSelectRecord}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <SectionHeading>What agents look for</SectionHeading>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <StoreInsightList
              title="Top queries"
              items={topQueries}
              isLoading={insightsLoading}
              emptyText="No searches in this window"
            />
            <StoreInsightList
              title="Zero-hit queries"
              items={zeroHit}
              isLoading={insightsLoading}
              emptyText="No zero-hit searches in this window"
              tone="destructive"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <SectionHeading>Write health</SectionHeading>
          <div className="flex flex-wrap gap-8 rounded-lg bg-secondary p-4">
            <StatCallout label="No-op rewrites" value={formatCount(insights?.noOpRewrites ?? 0)} subtext={undefined} />
            <StatCallout
              label="Duplicate records"
              value={formatCount(insights?.duplicateRecords ?? 0)}
              subtext={
                insights && insights.duplicateGroups > 0
                  ? `across ${formatCount(insights.duplicateGroups)} contents`
                  : undefined
              }
            />
          </div>
          <StoreWriteHealthTable
            records={insights?.writeHealth ?? []}
            isLoading={insightsLoading}
            onSelectRecord={onSelectRecord}
          />
        </div>

        <div className="flex flex-col gap-3">
          <SectionHeading>Footprint</SectionHeading>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <StoreInsightList
              title="Largest records"
              items={largest}
              isLoading={insightsLoading}
              emptyText="No live records"
              mono
              onSelectRecord={onSelectRecord}
            />
            <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4">
              <Text.H6 color="foregroundMuted">Size distribution</Text.H6>
              {insightsLoading ? (
                <HistogramSkeleton height={160} />
              ) : sizeEmpty ? (
                <div className="flex min-h-[120px] items-center justify-center">
                  <Text.H6 color="foregroundMuted">No live records</Text.H6>
                </div>
              ) : (
                <Chart
                  categories={sizeCategories}
                  series={sizeSeries}
                  height={160}
                  ariaLabel="Record size distribution"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
