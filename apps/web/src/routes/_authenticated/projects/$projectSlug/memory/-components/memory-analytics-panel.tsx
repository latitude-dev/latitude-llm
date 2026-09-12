import { Button, Chart, type ChartSeries, EmptyState, HistogramSkeleton, Icon, Skeleton, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { BarChart2, ChevronDown, ChevronUp } from "lucide-react"
import { useMemo, useState } from "react"
import type {
  MemoryActivityBucketRecord,
  MemoryOverviewRecord,
} from "../../../../../../domains/memories/memories.functions.ts"
import { ChartHeader } from "../../-components/chart-header.tsx"
import { formatBucketLabel, formatPercent, formatRatio } from "./memory-formatters.ts"

const ADD_COLOR = "hsl(142 71% 45%)"
const UPDATE_COLOR = "hsl(217 91% 60%)"
const REMOVE_COLOR = "hsl(0 70% 55%)"
const READS_COLOR = "hsl(199 89% 48%)"

// Fills every bucket over [fromMs, toMs] so quiet days render as zero bars
// instead of being dropped from the timeline. Bucket keys align with the
// backend's epoch-floored intervals, so present buckets match on start.
function denseHistogram(
  buckets: readonly MemoryActivityBucketRecord[],
  fromMs: number,
  toMs: number,
  bucketSeconds: number,
): readonly MemoryActivityBucketRecord[] {
  const bucketMs = bucketSeconds * 1000
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return buckets
  const byStart = new Map(buckets.map((bucket) => [Date.parse(bucket.bucketStart), bucket]))
  const firstBucketMs = Math.floor(fromMs / bucketMs) * bucketMs
  const result: MemoryActivityBucketRecord[] = []
  for (let startMs = firstBucketMs; startMs <= toMs; startMs += bucketMs) {
    result.push(
      byStart.get(startMs) ?? {
        bucketStart: new Date(startMs).toISOString(),
        creations: 0,
        updates: 0,
        deletions: 0,
        recordsRetrieved: 0,
      },
    )
  }
  return result
}

function AggregationItem({
  label,
  value,
  subtext,
  isLoading,
}: {
  readonly label: string
  readonly value: string
  readonly subtext?: string | undefined
  readonly isLoading?: boolean
}) {
  return (
    <div className="flex basis-[176px] min-w-[176px] shrink-0 flex-col gap-2">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {isLoading ? (
        <Skeleton className="h-5 w-16" />
      ) : (
        <div className="flex flex-col gap-0.5">
          <Text.H5 color="foreground" className="tabular-nums">
            {value}
          </Text.H5>
          {subtext ? (
            <Text.H6 color="foregroundMuted" className="tabular-nums">
              {subtext}
            </Text.H6>
          ) : null}
        </div>
      )}
    </div>
  )
}

export interface MemoryTile {
  readonly key: string
  readonly label: string
  readonly value: string
  readonly subtext?: string
}

function memoryTiles(overview: MemoryOverviewRecord | undefined): readonly MemoryTile[] {
  const o = overview
  return [
    { key: "records", label: "Records", value: formatCount(o?.liveRecords ?? 0) },
    {
      key: "tokens",
      label: "Total tokens",
      value: formatCount(o?.liveTokens ?? 0),
      ...(o && o.liveTokens > 0 ? { subtext: `${formatPercent(o.deadTokens / o.liveTokens)} dead` } : {}),
    },
    { key: "searches", label: "Searches", value: formatCount(o?.searches ?? 0) },
    { key: "writes", label: "Writes", value: formatCount(o?.writes ?? 0) },
    { key: "ratio", label: "Read:write", value: formatRatio(o?.recordsRetrieved ?? 0, o?.writes ?? 0) },
  ]
}

export function MemoryAnalyticsPanel({
  overview,
  tiles: tilesProp,
  histogram,
  bucketSeconds,
  rangeFromIso,
  rangeToIso,
  isAllTime,
  isLoading,
}: {
  readonly overview: MemoryOverviewRecord | undefined
  readonly tiles?: readonly MemoryTile[]
  readonly histogram: readonly MemoryActivityBucketRecord[]
  readonly bucketSeconds: number
  readonly rangeFromIso: string
  readonly rangeToIso: string
  readonly isAllTime: boolean
  readonly isLoading: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [showLeftFade, setShowLeftFade] = useState(false)
  const defaultTiles = useMemo(() => memoryTiles(overview), [overview])
  const tiles = tilesProp ?? defaultTiles

  const denseHistogramBuckets = useMemo(
    () => denseHistogram(histogram, Date.parse(rangeFromIso), Date.parse(rangeToIso), bucketSeconds),
    [histogram, rangeFromIso, rangeToIso, bucketSeconds],
  )

  const categories = useMemo(
    () => denseHistogramBuckets.map((bucket) => formatBucketLabel(bucket.bucketStart, bucketSeconds)),
    [denseHistogramBuckets, bucketSeconds],
  )

  const series = useMemo<readonly ChartSeries[]>(
    () => [
      {
        kind: "bar",
        name: "Created",
        values: denseHistogramBuckets.map((b) => b.creations),
        color: ADD_COLOR,
        axis: "left",
        stack: "changes",
      },
      {
        kind: "bar",
        name: "Updated",
        values: denseHistogramBuckets.map((b) => b.updates),
        color: UPDATE_COLOR,
        axis: "left",
        stack: "changes",
      },
      {
        kind: "bar",
        name: "Deleted",
        values: denseHistogramBuckets.map((b) => b.deletions),
        color: REMOVE_COLOR,
        axis: "left",
        stack: "changes",
      },
      {
        kind: "line",
        name: "Records retrieved",
        values: denseHistogramBuckets.map((b) => b.recordsRetrieved),
        color: READS_COLOR,
        axis: "right",
        smooth: true,
      },
    ],
    [denseHistogramBuckets],
  )

  const isEmpty =
    histogram.length === 0 || histogram.every((b) => b.creations + b.updates + b.deletions + b.recordsRetrieved === 0)

  if (collapsed) {
    return (
      <div className="flex flex-col rounded-lg bg-secondary">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-1.5">
            <Icon icon={BarChart2} size="sm" color="foregroundMuted" />
            <Text.H6 color="foregroundMuted">Memory statistics</Text.H6>
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
              {tiles.map((tile) => (
                <AggregationItem
                  key={tile.key}
                  label={tile.label}
                  value={tile.value}
                  subtext={tile.subtext}
                  isLoading={isLoading}
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
        ) : isEmpty ? (
          <EmptyState icon={BarChart2} message="No memory activity in this time window" />
        ) : (
          <>
            <ChartHeader
              title="Memory activity over time"
              fromIso={rangeFromIso}
              toIso={rangeToIso}
              isAllTime={isAllTime}
            />
            <div className="px-4 py-3">
              <Chart
                categories={categories}
                series={series}
                height={160}
                xAxisLabelFontSize={10}
                ariaLabel="Memory activity over time"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
