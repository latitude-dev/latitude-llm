import { Button, Chart, type ChartSeries, HistogramSkeleton, Icon, Skeleton, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { BarChart2, ChevronDown, ChevronUp } from "lucide-react"
import { useMemo, useState } from "react"
import type {
  MemoryActivityBucketRecord,
  MemoryAnalyticsOverviewRecord,
} from "../../../../../../domains/memories/memories.functions.ts"
import { ChartHeader } from "../../-components/chart-header.tsx"
import { formatBucketLabel, formatPercent, formatWriteYield } from "./memory-formatters.ts"

// Adds/updates/removes follow the record-diff colors used elsewhere; reads ride
// the right axis as a line so retrieval volume reads against write volume.
const ADD_COLOR = "hsl(142 71% 45%)"
const UPDATE_COLOR = "hsl(217 91% 60%)"
const REMOVE_COLOR = "hsl(0 70% 55%)"
const READS_COLOR = "hsl(199 89% 48%)"

function MemoryAggregationItem({
  label,
  value,
  subtext,
  isLoading,
  skeletonWidthClassName = "w-16",
}: {
  readonly label: string
  readonly value: string
  readonly subtext?: string | undefined
  readonly isLoading?: boolean
  readonly skeletonWidthClassName?: string
}) {
  return (
    <div className="flex basis-[176px] min-w-[176px] shrink-0 flex-col gap-2">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {isLoading ? (
        <Skeleton className={`h-5 ${skeletonWidthClassName}`} />
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

interface MemoryTile {
  readonly key: string
  readonly label: string
  readonly value: string
  readonly subtext?: string
}

function memoryOverviewTiles(overview: MemoryAnalyticsOverviewRecord | undefined): readonly MemoryTile[] {
  const o = overview
  const neverReadShare = o && o.liveTokens > 0 ? o.neverReadLiveTokens / o.liveTokens : 0
  const supersededUnread = o ? Math.max(0, o.completedVersions - o.consumedVersions) : 0
  return [
    { key: "records", label: "Records", value: formatCount(o?.liveRecords ?? 0) },
    {
      key: "tokens",
      label: "Live tokens",
      value: formatCount(o?.liveTokens ?? 0),
      ...(o ? { subtext: `${formatPercent(neverReadShare)} never read` } : {}),
    },
    { key: "readSessions", label: "Read sessions", value: formatCount(o?.readSessions ?? 0) },
    { key: "retrieved", label: "Retrieved tokens", value: formatCount(o?.retrievedTokens ?? 0) },
    {
      key: "writes",
      label: "Writes",
      value: formatCount(o?.contentWrites ?? 0),
      ...(o ? { subtext: `${formatCount(o.noopWrites)} no-ops` } : {}),
    },
    {
      key: "yield",
      label: "Write yield",
      value: formatWriteYield(o?.consumedVersions ?? 0, o?.completedVersions ?? 0),
      ...(o ? { subtext: `${formatCount(supersededUnread)} unread` } : {}),
    },
  ]
}

export function MemoryAnalyticsPanel({
  overview,
  histogram,
  bucketSeconds,
  rangeFromIso,
  rangeToIso,
  isAllTime,
  isLoading,
}: {
  readonly overview: MemoryAnalyticsOverviewRecord | undefined
  readonly histogram: readonly MemoryActivityBucketRecord[]
  readonly bucketSeconds: number
  readonly rangeFromIso: string
  readonly rangeToIso: string
  readonly isAllTime: boolean
  readonly isLoading: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [showLeftFade, setShowLeftFade] = useState(false)

  const tiles = useMemo(() => memoryOverviewTiles(overview), [overview])

  const categories = useMemo(
    () => histogram.map((bucket) => formatBucketLabel(bucket.bucketStart, bucketSeconds)),
    [histogram, bucketSeconds],
  )

  const series = useMemo<readonly ChartSeries[]>(
    () => [
      { kind: "bar", name: "Removed", values: histogram.map((b) => b.removes), color: REMOVE_COLOR, axis: "left", stack: "writes" },
      { kind: "bar", name: "Updated", values: histogram.map((b) => b.updates), color: UPDATE_COLOR, axis: "left", stack: "writes" },
      { kind: "bar", name: "Added", values: histogram.map((b) => b.adds), color: ADD_COLOR, axis: "left", stack: "writes" },
      { kind: "line", name: "Reads", values: histogram.map((b) => b.reads), color: READS_COLOR, axis: "right", smooth: true },
    ],
    [histogram],
  )

  const isEmpty = histogram.length === 0 || histogram.every((b) => b.adds + b.updates + b.removes + b.reads === 0)

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
                <MemoryAggregationItem
                  key={tile.key}
                  label={tile.label}
                  value={tile.value}
                  subtext={tile.subtext}
                  isLoading={isLoading}
                  skeletonWidthClassName={tile.key === "retrieved" || tile.key === "readSessions" ? "w-20" : "w-16"}
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
          <div className="flex w-full min-h-[80px] items-center justify-center px-4 py-3">
            <Text.H6 color="foregroundMuted">No memory activity in this time window</Text.H6>
          </div>
        ) : (
          <>
            <ChartHeader title="Memory activity over time" fromIso={rangeFromIso} toIso={rangeToIso} isAllTime={isAllTime} />
            <div className="px-4 py-3">
              <Chart categories={categories} series={series} height={160} xAxisLabelFontSize={10} ariaLabel="Memory activity over time" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
