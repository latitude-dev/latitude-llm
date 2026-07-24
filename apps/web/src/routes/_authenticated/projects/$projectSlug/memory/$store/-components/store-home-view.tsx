import { Chart, type ChartSeries, HistogramSkeleton, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useMemo } from "react"
import {
  useMemoryActivityHistogram,
  useMemoryOverview,
  useStoreInsights,
} from "../../../../../../../domains/memories/memories.collection.ts"
import type { StoreInsightsRecord } from "../../../../../../../domains/memories/memories.functions.ts"
import { useAnalyticsTimeWindow } from "../../../../../../../domains/projects/use-analytics-time-window.ts"
import { useProjectFirstTraceAt, useProjectLastTraceAt } from "../../../../../../../domains/traces/traces.collection.ts"
import { useRouteProject } from "../../../-route-data.ts"
import { MemoryAnalyticsPanel, type MemoryTile } from "../../-components/memory-analytics-panel.tsx"
import {
  formatBucketLabel,
  formatElapsed,
  formatPercent,
  formatRatio,
  pickMemoryTrendBucketSeconds,
} from "../../-components/memory-formatters.ts"
import { recordDisplayLabel } from "../../-components/store-encoding.ts"
import { StoreInsightList } from "./store-insight-list.tsx"
import { StoreWriteHealthTable } from "./store-write-health-table.tsx"

const SIZE_BAR_COLOR = "hsl(217 91% 60%)"
const TOKENS_COLOR = "hsl(199 89% 48%)"

type StoreTokenPointRecord = StoreInsightsRecord["tokenHistory"][number]

// Fill every bucket over [fromMs, toMs], carrying the last cumulative footprint forward across
// quiet buckets (a footprint holds flat when nothing is written, unlike zero-filled counts).
function denseTokenSeries(
  points: readonly StoreTokenPointRecord[],
  fromMs: number,
  toMs: number,
  bucketSeconds: number,
): readonly { readonly startMs: number; readonly tokens: number }[] {
  const bucketMs = bucketSeconds * 1000
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return points.map((point) => ({ startMs: Date.parse(point.bucketStart), tokens: point.tokens }))
  }
  const byStart = new Map(points.map((point) => [Date.parse(point.bucketStart), point.tokens]))
  const firstBucketMs = Math.floor(fromMs / bucketMs) * bucketMs
  const result: { startMs: number; tokens: number }[] = []
  let last = 0
  for (let startMs = firstBucketMs; startMs <= toMs; startMs += bucketMs) {
    const bucketTokens = byStart.get(startMs)
    if (bucketTokens !== undefined) last = bucketTokens
    result.push({ startMs, tokens: last })
  }
  return result
}

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

type StoreColdRecordRow = StoreInsightsRecord["coldRecords"][number]

function coldItems(insights: StoreInsightsRecord | undefined, nowMs: number) {
  const rows = insights?.coldRecords ?? []
  const lastActivityMs = (row: StoreColdRecordRow) =>
    Math.max(Date.parse(row.lastUpdatedAt), row.lastReadAt ? Date.parse(row.lastReadAt) : 0)
  const idleOf = (row: StoreColdRecordRow) => nowMs - lastActivityMs(row)
  const maxIdle = rows.length > 0 ? Math.max(...rows.map(idleOf)) : 0
  return rows.map((row) => ({
    key: row.recordId,
    label: recordDisplayLabel(row.recordId),
    value: `${formatElapsed(idleOf(row))} without activity`,
    fraction: maxIdle > 0 ? idleOf(row) / maxIdle : 0,
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

  // The Home dashboard is always all-time (no picker); the range spans the store's full history.
  const range = useMemo(
    () => ({ fromIso: tw.listRange.fromIso ?? tw.trendRange.fromIso, toIso: tw.listRange.toIso }),
    [tw.listRange, tw.trendRange],
  )
  const bucketSeconds = useMemo(
    () => pickMemoryTrendBucketSeconds(Date.parse(range.toIso) - Date.parse(range.fromIso)),
    [range],
  )

  const { data: overview, isLoading: overviewLoading } = useMemoryOverview({ projectId: project.id, storeId, range })
  const { data: histogram = [], isLoading: histogramLoading } = useMemoryActivityHistogram({
    projectId: project.id,
    storeId,
    range,
    bucketSeconds,
  })
  const { data: insights, isLoading: insightsLoading } = useStoreInsights({
    projectId: project.id,
    storeId,
    range,
    bucketSeconds,
  })

  const tiles = useMemo(() => storeOverviewTiles(overview), [overview])
  const mostRead = useMemo(() => mostReadItems(insights), [insights])
  const cold = useMemo(() => coldItems(insights, Date.now()), [insights])
  const topQueries = useMemo(() => queryItems(insights?.topQueries ?? []), [insights])
  const zeroHit = useMemo(() => queryItems(insights?.zeroHitQueries ?? []), [insights])
  const largest = useMemo(() => largestItems(insights), [insights])

  const denseTokens = useMemo(
    () =>
      denseTokenSeries(insights?.tokenHistory ?? [], Date.parse(range.fromIso), Date.parse(range.toIso), bucketSeconds),
    [insights, range, bucketSeconds],
  )
  const tokenCategories = useMemo(
    () => denseTokens.map((point) => formatBucketLabel(new Date(point.startMs).toISOString(), bucketSeconds)),
    [denseTokens, bucketSeconds],
  )
  const tokenSeries = useMemo<readonly ChartSeries[]>(
    () => [
      {
        kind: "line",
        name: "Total tokens",
        values: denseTokens.map((point) => point.tokens),
        color: TOKENS_COLOR,
        area: true,
      },
    ],
    [denseTokens],
  )
  const tokensEmpty = (insights?.tokenHistory ?? []).length === 0

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
        <MemoryAnalyticsPanel
          overview={overview}
          tiles={tiles}
          histogram={histogram}
          bucketSeconds={bucketSeconds}
          rangeFromIso={range.fromIso}
          rangeToIso={range.toIso}
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
              emptyText="No records idle over 7 days"
              mono
              tone="destructive"
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
            <StatCallout
              label="Thrash writes"
              value={formatCount(insights?.thrashWrites ?? 0)}
              subtext="repeats within a run"
            />
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
          <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4">
            <Text.H6 color="foregroundMuted">Total tokens over time</Text.H6>
            {insightsLoading ? (
              <HistogramSkeleton height={160} />
            ) : tokensEmpty ? (
              <div className="flex min-h-[120px] items-center justify-center">
                <Text.H6 color="foregroundMuted">No writes yet</Text.H6>
              </div>
            ) : (
              <Chart
                categories={tokenCategories}
                series={tokenSeries}
                height={160}
                xAxisLabelFontSize={10}
                ariaLabel="Total tokens over time"
              />
            )}
          </div>
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
