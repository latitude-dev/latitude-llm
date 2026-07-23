import { formatCount } from "@repo/utils"
import { useMemo } from "react"
import {
  useMemoryActivityHistogram,
  useMemoryOverview,
} from "../../../../../../../domains/memories/memories.collection.ts"
import { defaultProjectTimeWindowSeconds } from "../../../../../../../domains/projects/default-time-window.ts"
import { useAnalyticsTimeWindow } from "../../../../../../../domains/projects/use-analytics-time-window.ts"
import { useProjectFirstTraceAt, useProjectLastTraceAt } from "../../../../../../../domains/traces/traces.collection.ts"
import { TimeFilterDropdown } from "../../../-components/time-filter-dropdown.tsx"
import { useRouteProject } from "../../../-route-data.ts"
import { MemoryAnalyticsPanel, type MemoryTile } from "../../-components/memory-analytics-panel.tsx"
import { formatPercent, formatRatio, pickMemoryTrendBucketSeconds } from "../../-components/memory-formatters.ts"

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

export function StoreHomeView({ storeId }: { readonly storeId: string }) {
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

  const tiles = useMemo(() => storeOverviewTiles(overview), [overview])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
      <div className="flex flex-col gap-4 p-6">
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
      </div>
    </div>
  )
}
