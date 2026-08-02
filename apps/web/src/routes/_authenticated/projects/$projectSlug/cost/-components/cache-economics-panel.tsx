import { CACHE_ECONOMICS_MIN_CALLS, CACHE_MIN_CACHEABLE_INPUT_TOKENS, type CacheState } from "@domain/spans"
import type { BadgeProps } from "@repo/ui"
import {
  Badge,
  cn,
  DotIndicator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatPercentage } from "@repo/utils"
import type { CacheEconomicsRecord, CacheModelRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { rollupCostDisplay } from "../../../../../../domains/spans/cost-display.ts"
import { CALLS_SERIES_COLOR, TREND_COLOR } from "./cost-series-colors.ts"

const DASH = "—"

// Beyond this the table stops being a comparison. Rows are ranked by spend, so
// what falls off is what matters least.
const CACHE_ROWS_SHOWN = 10

const STATE_META: Record<CacheState, { readonly label: string; readonly variant: BadgeProps["variant"] }> = {
  optimal: { label: "Optimal", variant: "successMuted" },
  cacheIt: { label: "Cache it", variant: "warningMuted" },
  stopCaching: { label: "Stop caching", variant: "destructiveMuted" },
  investigate: { label: "Investigate", variant: "warningMuted" },
  correctlyOff: { label: "Correctly off", variant: "muted" },
  notEnoughData: { label: "Not enough data", variant: "muted" },
}

const avgInputTokensPerCall = (row: CacheModelRecord): number =>
  row.calls > 0 ? (row.inputTokens + row.cacheReadTokens + row.cacheCreateTokens) / row.calls : 0

function stateExplanation(row: CacheModelRecord): string {
  const breakEven = row.breakEvenRate === null ? null : formatPercentage(row.breakEvenRate)
  switch (row.state) {
    case "optimal":
      return `Reads cover ${formatPercentage(row.actualRate ?? 0)} of the input, past the ${breakEven} this model needs to pay for its cache writes.`
    case "cacheIt":
      return "This model charges no cache-write premium, so any prefix reuse is pure upside and turning caching on cannot cost more."
    case "stopCaching":
      return `This traffic cannot reach ${breakEven}, so every write is a cost with no matching discount ever arriving.`
    case "investigate":
      return row.urgency === "overpaying"
        ? `Reads cover only ${formatPercentage(row.actualRate ?? 0)} of the input, below the ${breakEven} break-even — caching is currently costing more than not caching. Every lever lives in your own code, so this flags the gap rather than prescribing a fix.`
        : "The rate clears break-even but leaves savings behind."
    case "correctlyOff":
      return avgInputTokensPerCall(row) < CACHE_MIN_CACHEABLE_INPUT_TOKENS
        ? `Prompts average ${formatCount(Math.round(avgInputTokensPerCall(row)))} tokens, under the ${formatCount(CACHE_MIN_CACHEABLE_INPUT_TOKENS)} the major providers will cache at all, so caching is unavailable here rather than unprofitable.`
        : `This traffic cannot reach ${breakEven}, so leaving caching off is the cheaper setup.`
    case "notEnoughData":
      if (row.breakEvenRate === null)
        return "No cache pricing is published for this model, so it has no break-even to compare against."
      if (row.calls < CACHE_ECONOMICS_MIN_CALLS)
        return `${formatCount(row.calls)} calls is below the ${CACHE_ECONOMICS_MIN_CALLS} a hit rate needs before it is a finding rather than a one-sample artefact.`
      return `Caching is off and this model charges a write premium, so whether caching would pay depends on how much of this traffic could hit the cache — the achievable ceiling that answers it is not computed yet.`
  }
}

/**
 * Actual against break-even on one shared 0-100% track: two numbers as position on
 * the same axis rather than two more numeric columns, which is what makes the
 * comparison readable down the table. Raw values move to the hover.
 */
function PositionBar({ row }: { readonly row: CacheModelRecord }) {
  const actual = row.actualRate
  const breakEven = row.breakEvenRate
  const clear = actual !== null && breakEven !== null && actual >= breakEven
  // A rate we declined to judge must not be the loudest mark on its own row: a
  // real quotient over three calls still reads as a finding when it is coloured
  // like one.
  const unjudged = row.state === "notEnoughData"

  return (
    <Tooltip
      asChild
      trigger={
        <div className="flex w-full cursor-default flex-row items-center gap-2">
          <div className="relative h-2.5 w-full overflow-hidden rounded-sm bg-muted">
            <div
              className={cn("h-full rounded-sm", { "bg-muted-foreground/40": unjudged })}
              style={{
                width: `${Math.max(0, Math.min(100, (actual ?? 0) * 100))}%`,
                ...(unjudged ? {} : { backgroundColor: clear ? CALLS_SERIES_COLOR : TREND_COLOR }),
              }}
            />
            {breakEven === null || unjudged ? null : (
              <div
                className="absolute inset-y-0 w-0.5 bg-foreground"
                style={{ left: `${Math.max(0, Math.min(100, breakEven * 100))}%` }}
                aria-hidden="true"
              />
            )}
          </div>
          <Text.H6 color="foregroundMuted" noWrap className="w-10 shrink-0 text-right tabular-nums">
            {actual === null ? DASH : formatPercentage(actual)}
          </Text.H6>
        </div>
      }
    >
      {[
        `Cached input ${actual === null ? DASH : formatPercentage(actual)} · break-even ${breakEven === null ? "unknown" : formatPercentage(breakEven)}`,
        `${formatCount(row.cacheReadTokens)} read, ${formatCount(row.cacheCreateTokens)} written, ${formatCount(row.inputTokens)} uncached input tokens`,
      ].join("\n")}
    </Tooltip>
  )
}

function CacheTable({ economics }: { readonly economics: CacheEconomicsRecord }) {
  const rows = economics.rows.slice(0, CACHE_ROWS_SHOWN)
  const hidden = economics.totals.distinctModels - rows.length

  return (
    <div className="flex flex-col gap-2">
      <Table wrapperClassName="border-0 rounded-none">
        <TableHeader className="[&_tr]:border-b-0">
          <TableRow hoverable={false}>
            <TableHead align="left" className="bg-transparent">
              <Text.H5M color="foregroundMuted" noWrap>
                Model
              </Text.H5M>
            </TableHead>
            <TableHead align="left" className="bg-transparent border-l border-border">
              <Text.H5M color="foregroundMuted" noWrap>
                Provider
              </Text.H5M>
            </TableHead>
            <TableHead align="left" className="bg-transparent border-l border-border">
              <Tooltip
                asChild
                trigger={
                  <span className="inline-flex cursor-default">
                    <Text.H5M color="foregroundMuted" noWrap>
                      Position
                    </Text.H5M>
                  </span>
                }
              >
                The share of input tokens served from cache, against the rate this model needs to break even. The
                break-even mark comes from the model's own registry prices, so it differs row to row.
              </Tooltip>
            </TableHead>
            <TableHead align="left" className="bg-transparent border-l border-border">
              <Text.H5M color="foregroundMuted" noWrap>
                State
              </Text.H5M>
            </TableHead>
            <TableHead align="right" className="bg-transparent border-l border-border">
              <Text.H5M color="foregroundMuted" noWrap>
                Calls
              </Text.H5M>
            </TableHead>
            <TableHead align="right" className="bg-transparent border-l border-border">
              <Text.H5M color="foregroundMuted" noWrap>
                Spend
              </Text.H5M>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const spend = rollupCostDisplay({
              costTotalMicrocents: row.costMicrocents,
              unpricedSpanCount: row.unpricedCalls,
              tokensTotal: row.inputTokens + row.cacheReadTokens + row.cacheCreateTokens,
            })
            const meta = STATE_META[row.state]
            return (
              <TableRow key={`${row.provider}/${row.model}`} className="border-background bg-secondary/40">
                <TableCell>
                  <div className="flex flex-row items-center gap-2">
                    <Tooltip
                      asChild
                      trigger={
                        <DotIndicator
                          variant={row.cachingOn ? "success" : "default"}
                          className={row.cachingOn ? undefined : "opacity-50"}
                          aria-hidden={false}
                          aria-label={row.cachingOn ? "Caching on" : "Caching off"}
                        />
                      }
                    >
                      {row.cachingOn ? "Caching on in this window" : "No cache reads or writes in this window"}
                    </Tooltip>
                    <Text.H5 color="foreground" ellipsis noWrap>
                      {row.model || "unknown model"}
                    </Text.H5>
                  </div>
                </TableCell>
                <TableCell>
                  <Text.H5 color="foregroundMuted" ellipsis noWrap>
                    {row.provider || "unknown"}
                  </Text.H5>
                </TableCell>
                <TableCell>
                  <PositionBar row={row} />
                </TableCell>
                <TableCell>
                  <Tooltip
                    asChild
                    trigger={
                      <Badge variant={meta.variant} size="small">
                        {meta.label}
                      </Badge>
                    }
                  >
                    {stateExplanation(row)}
                  </Tooltip>
                </TableCell>
                <TableCell align="right">
                  <Text.H5 color="foreground" noWrap className="tabular-nums">
                    {formatCount(row.calls)}
                  </Text.H5>
                </TableCell>
                <TableCell align="right">
                  {spend.note ? (
                    <Tooltip
                      asChild
                      trigger={
                        <span className="inline-flex cursor-default">
                          <Text.H5 color="foreground" noWrap className="tabular-nums">
                            {spend.label}
                          </Text.H5>
                        </span>
                      }
                    >
                      {spend.note}
                    </Tooltip>
                  ) : (
                    <Text.H5 color="foreground" noWrap className="tabular-nums">
                      {spend.label}
                    </Text.H5>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <div className="flex flex-row items-center justify-between gap-2">
        <Text.H6 color="foregroundMuted">
          Rates are measured exactly from token counts; spend is the recorded total. Break-even is derived per model
          from its registry prices, so a model with no cache-write premium breaks even at 0%.
        </Text.H6>
        {hidden > 0 ? (
          <Text.H6 color="foregroundMuted" noWrap>
            {`${formatCount(hidden)} lower-spending models not shown`}
          </Text.H6>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Whether each model's caching is paying for itself. A comparison table rather
 * than one model at a time: break-even differs per model, which is exactly the
 * thing paging through them one by one hides.
 */
export function CacheEconomicsPanel({
  economics,
  isLoading,
}: {
  readonly economics: CacheEconomicsRecord | undefined
  readonly isLoading: boolean
}) {
  return (
    // The row separators are painted in `--background`, so the card must carry it.
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <Text.H6 color="foreground">Cache economics</Text.H6>
        <div className="flex flex-row items-center gap-3">
          {[
            { label: "Clears break-even", color: CALLS_SERIES_COLOR },
            { label: "Below break-even", color: TREND_COLOR },
          ].map((entry) => (
            <div key={entry.label} className="flex flex-row items-center gap-1.5">
              <span
                className="h-2 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <Text.H6 color="foregroundMuted" noWrap>
                {entry.label}
              </Text.H6>
            </div>
          ))}
          <div className="flex flex-row items-center gap-1.5">
            <span className="h-2.5 w-0.5 shrink-0 bg-foreground" aria-hidden="true" />
            <Text.H6 color="foregroundMuted" noWrap>
              Break-even
            </Text.H6>
          </div>
        </div>
      </div>
      {isLoading || !economics ? (
        <TableSkeleton rows={5} cols={6} />
      ) : economics.rows.length === 0 ? (
        <div className="flex w-full min-h-[120px] items-center justify-center">
          <Text.H6 color="foregroundMuted">No billable model usage in this time window</Text.H6>
        </div>
      ) : (
        <CacheTable economics={economics} />
      )}
    </div>
  )
}
