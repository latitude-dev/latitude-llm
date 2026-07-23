import { Button, Icon, Skeleton, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { BarChart2, ChevronDown, ChevronUp } from "lucide-react"
import { useMemo, useState } from "react"
import type { MemoryOverviewRecord } from "../../../../../../domains/memories/memories.functions.ts"
import { formatPercent, formatRatio } from "./memory-formatters.ts"

function AggregationItem({
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

function memoryTiles(overview: MemoryOverviewRecord | undefined): readonly MemoryTile[] {
  const o = overview
  return [
    { key: "records", label: "Records", value: formatCount(o?.liveRecords ?? 0) },
    {
      key: "tokens",
      label: "Live tokens",
      value: formatCount(o?.liveTokens ?? 0),
      ...(o && o.liveTokens > 0 ? { subtext: `${formatPercent(o.deadTokens / o.liveTokens)} dead` } : {}),
    },
    { key: "searches", label: "Searches", value: formatCount(o?.searches ?? 0) },
    {
      key: "zeroHit",
      label: "Zero-hit rate",
      value: o && o.searches > 0 ? formatPercent(o.zeroHitSearches / o.searches) : "-",
    },
    { key: "writes", label: "Writes", value: formatCount(o?.writes ?? 0) },
    { key: "ratio", label: "Read:write", value: formatRatio(o?.recordsRetrieved ?? 0, o?.writes ?? 0) },
  ]
}

export function MemoryAnalyticsPanel({
  overview,
  isLoading,
}: {
  readonly overview: MemoryOverviewRecord | undefined
  readonly isLoading: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [showLeftFade, setShowLeftFade] = useState(false)
  const tiles = useMemo(() => memoryTiles(overview), [overview])

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
      </div>
    </div>
  )
}
