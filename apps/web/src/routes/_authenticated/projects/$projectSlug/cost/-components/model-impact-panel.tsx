import { COST_PER_CALL_MIN_SAMPLE_CALLS, type CostBreakdown } from "@domain/spans"
import { Badge, Skeleton, Text, Tooltip, useChartCssTheme } from "@repo/ui"
import { formatCount, formatPercentage } from "@repo/utils"
import { CircleDollarSignIcon } from "lucide-react"
import { ChartHeader } from "../../-components/chart-header.tsx"
import {
  costPerCallMultiple,
  formatCostMultiple,
  formatSignedPrice,
  microcentsToUsd,
  shareOf,
  splitBreakdownRows,
} from "./cost-formatters.ts"
import { callsSeriesColor, otherSeriesColor, trendColor } from "./cost-series-colors.ts"
import { EmptyState } from "./empty-state.tsx"

// Models charted individually. Past this the paired bars stop being scannable, and
// the remainder row keeps the shares adding to 100% anyway.
const IMPACT_ROW_LIMIT = 8

// Below this a pair is two invisible slivers: it says nothing about proportion and
// costs a row. Such models fold into the remainder rather than being dropped.
const IMPACT_MIN_VISIBLE_SHARE = 0.01

const AXIS_TICKS = [0, 0.25, 0.5, 0.75, 1] as const

interface ImpactRow {
  readonly key: string
  readonly label: string
  readonly spendShare: number
  readonly callsShare: number
  readonly costMicrocents: number
  readonly calls: number
  readonly multiple: number | null
  readonly isRemainder: boolean
}

function Gridlines() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-row justify-between">
      {AXIS_TICKS.map((tick) => (
        <div key={tick} className="w-px bg-border" />
      ))}
    </div>
  )
}

/** Length on a shared 0-100% scale for both measures, so the two are directly comparable. */
function SharePair({ row, isDark }: { readonly row: ImpactRow; readonly isDark: boolean }) {
  const bars = [
    { label: "spend", share: row.spendShare, color: row.isRemainder ? otherSeriesColor(isDark) : trendColor(isDark) },
    {
      label: "calls",
      share: row.callsShare,
      color: row.isRemainder ? otherSeriesColor(isDark) : callsSeriesColor(isDark),
    },
  ]

  return (
    <div className="flex w-full flex-row items-center gap-2">
      {/* Gridlines are scoped to the track so a tick and a bar of the same share line up. */}
      <div className="relative flex w-full flex-col gap-1 py-0.5">
        <Gridlines />
        {bars.map((bar, index) => (
          <div
            key={bar.label}
            // The two bars hug the seam between their slots — bottom-aligned then top-aligned —
            // instead of each centering in its own slot, which halved this gap by centering it
            // in the space around the pair rather than around each bar individually.
            className={`relative flex h-4 w-full ${index === 0 ? "items-end" : "items-start"}`}
          >
            <div className="relative h-1 w-full overflow-hidden rounded-sm bg-muted">
              <div
                className="h-full min-w-[2px] rounded-sm"
                style={{ width: `${Math.max(0, Math.min(100, bar.share * 100))}%`, backgroundColor: bar.color }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex w-12 shrink-0 flex-col gap-1">
        {bars.map((bar) => (
          <div key={bar.label} className="flex h-4 items-center justify-end">
            <Text.H6 color="foregroundMuted" noWrap className="tabular-nums">
              {formatPercentage(bar.share)}
            </Text.H6>
          </div>
        ))}
      </div>
    </div>
  )
}

function MultipleChip({ row }: { readonly row: ImpactRow }) {
  if (row.multiple === null) {
    return (
      <Tooltip
        asChild
        trigger={
          <span className="inline-flex cursor-default">
            <Text.H6 color="foregroundMuted">—</Text.H6>
          </span>
        }
      >
        {row.costMicrocents <= 0
          ? "This model recorded no cost, so it has no cost per call to compare."
          : `Needs at least ${COST_PER_CALL_MIN_SAMPLE_CALLS} calls before its cost per call is compared to the average — ${formatCount(row.calls)} would be a one-sample ratio, not a finding.`}
      </Tooltip>
    )
  }
  return (
    <Tooltip
      asChild
      trigger={
        <Badge variant={row.multiple >= 2 ? "warningMuted" : "muted"} size="small">
          {`${formatCostMultiple(row.multiple)} avg`}
        </Badge>
      }
    >
      {`${formatSignedPrice(microcentsToUsd(row.costMicrocents / row.calls))} per call against the window average, over ${formatCount(row.calls)} calls. Above 1x means this model takes a larger share of the money than of the usage.`}
    </Tooltip>
  )
}

function buildImpactRows(breakdown: CostBreakdown): readonly ImpactRow[] {
  const { totals } = breakdown
  const { visible, remainder } = splitBreakdownRows({
    breakdown,
    limit: IMPACT_ROW_LIMIT,
    minShare: IMPACT_MIN_VISIBLE_SHARE,
  })

  const rows: ImpactRow[] = visible.map((row) => ({
    key: row.key || "unknown",
    label: row.key || "unknown model",
    spendShare: shareOf(row.totalMicrocents, totals.totalMicrocents) ?? 0,
    callsShare: shareOf(row.calls, totals.calls) ?? 0,
    costMicrocents: row.totalMicrocents,
    calls: row.calls,
    multiple: costPerCallMultiple({
      totalMicrocents: row.totalMicrocents,
      calls: row.calls,
      avgPerCallMicrocents: totals.avgPerCallMicrocents,
    }),
    isRemainder: false,
  }))

  if (!remainder) return rows
  return [
    ...rows,
    {
      key: "__other__",
      label: remainder.valueCount === 1 ? "Other (1 model)" : `Other (${remainder.valueCount} models)`,
      spendShare: shareOf(remainder.totalMicrocents, totals.totalMicrocents) ?? 0,
      callsShare: shareOf(remainder.calls, totals.calls) ?? 0,
      costMicrocents: remainder.totalMicrocents,
      calls: remainder.calls,
      // Deliberately absent: a multiple over a bag of different models is not a finding.
      multiple: null,
      isRemainder: true,
    },
  ]
}

/**
 * Whether a model's share of the money is out of proportion to its share of the usage.
 *
 * Both measures are length on one shared, labeled 0-100% axis, which is what the cut
 * bubble chart got wrong: it encoded this as position plus area, the channel compared
 * least accurately, and named neither dimension.
 */
export function ModelImpactPanel({
  breakdown,
  rangeFromIso,
  rangeToIso,
  isAllTime,
  isLoading,
}: {
  readonly breakdown: CostBreakdown | undefined
  readonly rangeFromIso: string
  readonly rangeToIso: string
  readonly isAllTime: boolean
  readonly isLoading: boolean
}) {
  const { isDark } = useChartCssTheme()
  const rows = breakdown ? buildImpactRows(breakdown) : []
  const hasSpend = (breakdown?.totals.totalMicrocents ?? 0) > 0

  return (
    <div className="flex flex-1 flex-col rounded-lg border border-border bg-background">
      <ChartHeader
        title="Spend against usage"
        fromIso={rangeFromIso}
        toIso={rangeToIso}
        isAllTime={isAllTime}
        // The picker above states this window already, and the recent-activity
        // distinction that other dashboards flag isn't relevant to this panel.
        showWindow={false}
        titleColor="foregroundMuted"
        actions={
          <div className="flex flex-row items-center gap-3">
            {[
              { label: "Share of spend", color: trendColor(isDark) },
              { label: "Share of calls", color: callsSeriesColor(isDark) },
            ].map((entry) => (
              <div key={entry.label} className="flex flex-row items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
                <Text.H6 color="foregroundMuted" noWrap>
                  {entry.label}
                </Text.H6>
              </div>
            ))}
          </div>
        }
      />
      {isLoading || !breakdown ? (
        <div className="flex flex-col gap-3 px-4 py-3">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-8 w-full" />
          ))}
        </div>
      ) : !hasSpend || rows.length === 0 ? (
        <EmptyState icon={CircleDollarSignIcon} message="No spend recorded in this time window" />
      ) : (
        <div className="flex flex-col gap-2 px-4 py-3">
          <div className="flex flex-col gap-2.5">
            {rows.map((row) => (
              <div key={row.key} className="flex flex-row items-center gap-3">
                <div className="flex w-32 shrink-0 flex-col">
                  <Text.H6 color={row.isRemainder ? "foregroundMuted" : "foreground"} ellipsis noWrap>
                    {row.label}
                  </Text.H6>
                </div>
                <SharePair row={row} isDark={isDark} />
                <div className="flex w-16 shrink-0 justify-end">
                  <MultipleChip row={row} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-row items-center gap-3">
            <div className="w-32 shrink-0" />
            <div className="flex w-full flex-row items-center gap-2">
              <div className="flex w-full flex-row justify-between">
                {AXIS_TICKS.map((tick) => (
                  <Text.H6 key={tick} color="foregroundMuted" noWrap>
                    {formatPercentage(tick)}
                  </Text.H6>
                ))}
              </div>
              <div className="w-12 shrink-0" />
            </div>
            <div className="w-16 shrink-0" />
          </div>
        </div>
      )}
    </div>
  )
}
