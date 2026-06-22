import type { TokenAnalyticsAggregate } from "@domain/spans"
import { Text, Tooltip } from "@repo/ui"
import { formatCount, formatPercentage } from "@repo/utils"

function BreakdownRow({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="flex flex-row items-center justify-between gap-4">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <Text.H6 color="foreground">{formatCount(value)}</Text.H6>
    </div>
  )
}

/**
 * Aggregate cache hit rate for the filtered set, shown under the Cache Hit Rate
 * column. The rate is token-weighted (computed server-side from summed tokens),
 * so — unlike the other subheaders — it is a single value, not a min/max/avg
 * rollup. The tooltip surfaces the aggregated input/output token totals.
 */
export function CacheHitRateSubheader({
  analytics,
  isLoading,
}: {
  readonly analytics: TokenAnalyticsAggregate | null | undefined
  readonly isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <Text.H6 color="foregroundMuted" className="px-1 tabular-nums truncate">
        …
      </Text.H6>
    )
  }

  if (!analytics || analytics.cacheHitRate === null) {
    return (
      <Text.H6 color="foregroundMuted" className="px-1 truncate">
        —
      </Text.H6>
    )
  }

  return (
    <Tooltip
      asChild
      trigger={
        <div className="flex min-w-0 w-full items-center justify-end px-2">
          <span className="shrink-0 text-xs leading-4 font-semibold text-foreground tabular-nums">
            {formatPercentage(analytics.cacheHitRate)}
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-1.5 min-w-[160px]">
        <BreakdownRow label="Input" value={analytics.inputTokens} />
        <BreakdownRow label="Cached Input" value={analytics.cacheReadTokens} />
        <BreakdownRow label="Cache Write" value={analytics.cacheCreateTokens} />
        <BreakdownRow label="Output" value={analytics.outputTokens} />
      </div>
    </Tooltip>
  )
}
