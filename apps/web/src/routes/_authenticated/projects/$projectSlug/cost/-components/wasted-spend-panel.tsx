import { WASTED_SPEND_MIN_SAMPLE_TRACES } from "@domain/spans"
import { Icon, Skeleton, Text, Tooltip, useChartCssTheme } from "@repo/ui"
import { formatCount, formatPercentage } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon, CircleCheckIcon, InfoIcon } from "lucide-react"
import type { WastedSpendRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { rollupCostDisplay } from "../../../../../../domains/spans/cost-display.ts"
import { ChartHeader } from "../../-components/chart-header.tsx"
import { serializeFilters } from "../../-components/trace-page-state.ts"
import { formatSignedPrice, microcentsToUsd, shareOf } from "./cost-formatters.ts"
import { otherSeriesColor } from "./cost-series-colors.ts"
import { EmptyState } from "./empty-state.tsx"
import { SplitValue } from "./split-value.tsx"

// Named after the money, not the mechanism: a failure with no `error.type` attribute is a
// row the user has to be able to act on, and "unknown" reads as a value the model returned.
const UNLABELLED_REASON = "No error type recorded"

/** Held outside the model ramp: these bars encode failure, not a model. red-400 / red-600. */
const wastedBarColor = (isDark: boolean): string => (isDark ? "oklch(57.7% 0.245 27.325)" : "oklch(70.4% 0.191 22.216)")

interface ReasonRow {
  readonly key: string
  readonly label: string
  readonly traces: number
  readonly costMicrocents: number
  readonly isRemainder: boolean
}

function buildReasonRows(record: WastedSpendRecord): readonly ReasonRow[] {
  const rows: ReasonRow[] = record.reasons.map((reason) => ({
    key: reason.errorType || "__unlabelled__",
    label: reason.errorType || UNLABELLED_REASON,
    traces: reason.traces,
    costMicrocents: reason.costMicrocents,
    isRemainder: false,
  }))
  const other = record.otherReasons
  if (!other) return rows
  return [
    ...rows,
    {
      key: "__other__",
      label: other.typeCount === 1 ? "1 other reason" : `${other.typeCount} other reasons`,
      traces: other.traces,
      costMicrocents: other.costMicrocents,
      isRemainder: true,
    },
  ]
}

/**
 * The share of the panel's own total, never of the window: these bars answer "what was the
 * money wasted on", and a row's share of total spend would be a second, smaller-looking
 * number for the same fact.
 */
function ReasonBar({
  share,
  isRemainder,
  isDark,
}: {
  readonly share: number
  readonly isRemainder: boolean
  readonly isDark: boolean
}) {
  return (
    <div className="relative flex h-4 w-full items-center">
      <div className="relative h-1 w-full overflow-hidden rounded-sm bg-muted">
        <div
          className="h-full min-w-[2px] rounded-sm"
          style={{
            width: `${Math.max(0, Math.min(100, share * 100))}%`,
            backgroundColor: isRemainder ? otherSeriesColor(isDark) : wastedBarColor(isDark),
          }}
        />
      </div>
    </div>
  )
}

/**
 * Money that bought nothing: what this window spent on traces that errored.
 *
 * Whole-trace by decision, stated in the headline tooltip — a failed call usually records
 * no usage of its own, so charging only the failed span would report ~$0 for exactly the
 * traces that wasted the most. Nothing else on the page shows a per-span framing of the
 * same claim; the two would not reconcile.
 */
export function WastedSpendPanel({
  record,
  projectSlug,
  rangeFromIso,
  rangeToIso,
  isAllTime,
  isLoading,
}: {
  readonly record: WastedSpendRecord | undefined
  readonly projectSlug: string
  readonly rangeFromIso: string
  readonly rangeToIso: string
  readonly isAllTime: boolean
  readonly isLoading: boolean
}) {
  const { isDark } = useChartCssTheme()
  const rows = record ? buildReasonRows(record) : []
  const wasted = rollupCostDisplay({
    costTotalMicrocents: record?.erroredCostMicrocents ?? 0,
    unpricedSpanCount: record?.erroredUnpricedCalls ?? 0,
    tokensTotal: record?.erroredTokens ?? 0,
  })
  // The same Status filter the traces list applies, so the drill-down returns the very
  // traces this panel counted rather than a differently-defined subset.
  const erroredTracesSearch = {
    tab: "traces",
    filters: serializeFilters({
      status: [{ op: "in", value: ["error"] }],
      startTime: [
        { op: "gte", value: rangeFromIso },
        { op: "lte", value: rangeToIso },
      ],
    }),
  }

  return (
    <div className="flex flex-1 flex-col rounded-lg border border-border bg-background">
      <ChartHeader
        title="Wasted spend"
        fromIso={rangeFromIso}
        toIso={rangeToIso}
        isAllTime={isAllTime}
        // The picker above already states this window, the same as every sibling panel.
        showWindow={false}
        titleColor="foregroundMuted"
      />
      {isLoading || !record ? (
        <div className="flex flex-col gap-3 px-4 py-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : record.erroredTraces === 0 ? (
        <EmptyState
          icon={CircleCheckIcon}
          message={
            record.tracesWithUsage === 0 ? "No spend recorded in this time window" : "No spend on traces that errored"
          }
        />
      ) : (
        <div className="flex flex-col gap-4 px-4 py-3">
          <div className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-row items-center gap-1">
                <Text.H6M color="foregroundMuted" noWrap>
                  Spent on traces that errored
                </Text.H6M>
                <Tooltip
                  asChild
                  trigger={
                    <span className="inline-flex cursor-default">
                      <Icon icon={InfoIcon} size="sm" color="foregroundMuted" />
                    </span>
                  }
                >
                  {`Everything these traces spent, not only their failed steps. A failed call usually records no usage of its own — the money went on the steps that succeeded and whose output was then discarded. A trace counts as errored when at least one of its spans failed, the same definition the traces list uses.${wasted.note ? ` ${wasted.note}` : ""}`}
                </Tooltip>
              </div>
              <div className="flex flex-col gap-0.5">
                <Text.H3M color="foreground" noWrap className="tabular-nums">
                  <SplitValue formatted={wasted.label} />
                </Text.H3M>
                <Text.H6 color="foregroundMuted">
                  {`${formatCount(record.erroredTraces)} of ${formatCount(record.tracesWithUsage)} traces with usage errored`}
                </Text.H6>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Text.H6M color="foregroundMuted" noWrap>
                Share of spend
              </Text.H6M>
              {record.wastedShare === null ? (
                <Tooltip
                  asChild
                  trigger={
                    <span className="inline-flex cursor-default">
                      <Text.H3M color="foregroundMuted" noWrap>
                        —
                      </Text.H3M>
                    </span>
                  }
                >
                  {record.erroredCostMicrocents <= 0
                    ? "These traces errored without recording any spend, so there is a count to act on but no share of the money."
                    : `A share needs at least ${WASTED_SPEND_MIN_SAMPLE_TRACES} traces with usage — over ${formatCount(record.tracesWithUsage)}, one failure moves the figure by tens of points.`}
                </Tooltip>
              ) : (
                <Text.H3M color="foreground" noWrap className="tabular-nums">
                  <SplitValue formatted={formatPercentage(record.wastedShare)} />
                </Text.H3M>
              )}
              <Link
                to="/projects/$projectSlug"
                params={{ projectSlug }}
                search={erroredTracesSearch}
                aria-label="View the errored traces in this window"
                className="group inline-flex flex-row items-center gap-1"
              >
                <Text.H6 color="foregroundMuted" noWrap className="group-hover:text-primary">
                  View errored traces
                </Text.H6>
                <Icon
                  icon={ArrowUpRightIcon}
                  size="xs"
                  color="foregroundMuted"
                  className="shrink-0 group-hover:text-primary"
                />
              </Link>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            {rows.map((row) => (
              <div key={row.key} className="flex flex-row items-center gap-3">
                <div className="flex w-40 shrink-0 flex-col pr-2">
                  <Text.H6 color={row.isRemainder ? "foregroundMuted" : "foreground"} ellipsis noWrap>
                    {row.label}
                  </Text.H6>
                </div>
                <ReasonBar
                  share={shareOf(row.costMicrocents, record.erroredCostMicrocents) ?? 0}
                  isRemainder={row.isRemainder}
                  isDark={isDark}
                />
                <div className="flex w-16 shrink-0 justify-end">
                  <Text.H6 color="foregroundMuted" noWrap className="tabular-nums">
                    {formatSignedPrice(microcentsToUsd(row.costMicrocents))}
                  </Text.H6>
                </div>
                <div className="flex w-20 shrink-0 justify-end">
                  <Text.H6 color="foregroundMuted" noWrap className="tabular-nums">
                    {`${formatCount(row.traces)} ${row.traces === 1 ? "trace" : "traces"}`}
                  </Text.H6>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
