import { CACHE_ECONOMICS_MIN_CALLS, CACHE_MIN_CACHEABLE_INPUT_TOKENS, type CacheState } from "@domain/spans"
import type { BadgeProps } from "@repo/ui"
import {
  Badge,
  Button,
  cn,
  Icon,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableSkeleton,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, formatPercentage, formatPrice } from "@repo/utils"
import { ClockIcon, InfoIcon } from "lucide-react"
import { useState } from "react"
import type { CacheEconomicsRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { rollupCostDisplay } from "../../../../../../domains/spans/cost-display.ts"
import {
  buildCacheFindings,
  CACHE_LIFETIME_OPTIONS,
  CACHE_RECOMMENDATION_COPY,
  type CacheFindingSection,
  type CacheLifetimeSelection,
  type CacheRowView,
  recoverableShare,
  resolveCacheRow,
  sortCacheRowsBySavings,
  summariseSettledRows,
} from "./cache-economics-view.ts"
import { microcentsToUsd } from "./cost-formatters.ts"
import { CALLS_SERIES_COLOR } from "./cost-series-colors.ts"
import { CostTableHead } from "./cost-table-head.tsx"

const DASH = "—"

// Beyond this the table stops being a comparison. It sits behind a toggle anyway, so the
// first screen is the findings rather than a wall of models.
const CACHE_ROWS_SHOWN = 10

const STATE_META: Record<CacheState, { readonly label: string; readonly variant: BadgeProps["variant"] }> = {
  optimal: { label: "Optimal", variant: "successMuted" },
  cacheIt: { label: "Cache it", variant: "warningMuted" },
  stopCaching: { label: "Stop caching", variant: "destructiveMuted" },
  investigate: { label: "Investigate", variant: "warningMuted" },
  correctlyOff: { label: "Correctly off", variant: "muted" },
  notEnoughData: { label: "Not enough data", variant: "muted" },
}

const SECTION_VARIANT: Record<CacheFindingSection["state"], BadgeProps["variant"]> = {
  cacheIt: "warningMuted",
  stopCaching: "destructiveMuted",
  investigate: "warningMuted",
}

const LIFETIME_TOOLTIP =
  "Play with the cache time to see how our estimate changes. Every value here is a guess, including the default, which uses what each provider publishes."

const SAVINGS_TOOLTIP =
  "An estimate, worked out from your token counts and each model's list prices. It will not match the spend figures elsewhere on this page exactly."

const formatLifetime = (lifetimeSeconds: number | null): string | null =>
  lifetimeSeconds === null ? null : formatDuration(lifetimeSeconds * 1_000_000_000)

const lifetimeOptionLabel = (option: CacheLifetimeSelection): string =>
  option === "documented" ? "Documented" : (formatLifetime(option) ?? String(option))

const avgInputTokensPerCall = (row: CacheRowView): number =>
  row.calls > 0 ? (row.inputTokens + row.cacheReadTokens + row.cacheCreateTokens) / row.calls : 0

function stateExplanation(row: CacheRowView): string {
  const breakEven = row.judgment.breakEvenRate === null ? null : formatPercentage(row.judgment.breakEvenRate)
  const ceiling = row.judgment.ceilingRate === null ? null : formatPercentage(row.judgment.ceilingRate)
  const actual = formatPercentage(row.judgment.actualRate ?? 0)
  switch (row.judgment.state) {
    case "optimal":
      return `Reads cover ${actual} of the input. Caching is paying for itself here.`
    case "cacheIt":
      return `Caching is off, and this cadence could serve ${ceiling ?? "most"} of the prompt from cache.`
    case "stopCaching":
      return "Calls arrive too far apart to read an entry back before it expires, so the writes buy nothing."
    case "investigate":
      return row.judgment.urgency === "overpaying"
        ? `Reads cover ${actual}, and the writes cost more than not caching at all. The cadence allows ${ceiling}, so the gap is in the prompt.`
        : `Reads cover ${actual} where the cadence allows ${ceiling}.`
    case "correctlyOff":
      if (avgInputTokensPerCall(row) < CACHE_MIN_CACHEABLE_INPUT_TOKENS) {
        return `Prompts average ${formatCount(Math.round(avgInputTokensPerCall(row)))} tokens, under the ${formatCount(CACHE_MIN_CACHEABLE_INPUT_TOKENS)} providers will cache at all.`
      }
      return `This cadence tops out at ${ceiling ?? "a rate below break-even"}, so leaving caching off is cheaper.`
    case "notEnoughData":
      if (row.judgment.breakEvenRate === null) return "No cache pricing is published for this model."
      if (row.calls < CACHE_ECONOMICS_MIN_CALLS)
        return `${formatCount(row.calls)} calls is under the ${CACHE_ECONOMICS_MIN_CALLS} a rate needs to mean anything.`
      return `Caching is off and this model charges to write, so the answer depends on a ceiling this window cannot measure. Break-even is ${breakEven}.`
  }
}

/**
 * How much of what this model costs is recoverable, as one bar.
 *
 * Fixed width with the fill as a share of the row's own spend, rather than width as a
 * share of the largest spender: gpt-5.6 against a small model is a six to one ratio,
 * which turns every other row into a sliver.
 *
 * Money is also the only quantity that means the same thing in all three states. A bar of
 * unused headroom says nothing for `Stop caching`, where the ceiling is zero and the money
 * is a write premium paid for nothing.
 */
function RecoverableBar({ row }: { readonly row: CacheRowView }) {
  const share = recoverableShare(row)
  const savings = row.judgment.modeledSavingsMicrocents
  if (share === null || savings === null) return null

  return (
    <Tooltip
      asChild
      trigger={
        <div className="flex w-full cursor-default flex-row items-center gap-2">
          <div className="relative h-2 w-full overflow-hidden rounded-sm bg-muted">
            {share <= 0 ? null : (
              <div
                className="absolute inset-y-0 left-0"
                style={{ width: `${share * 100}%`, backgroundColor: CALLS_SERIES_COLOR }}
                aria-hidden="true"
              />
            )}
          </div>
          <Text.H6 color="foregroundMuted" noWrap className="w-9 shrink-0 text-right tabular-nums">
            {formatPercentage(share)}
          </Text.H6>
        </div>
      }
    >
      {`${formatPrice(microcentsToUsd(savings))} of the ${formatPrice(microcentsToUsd(row.costMicrocents))} you spend here.`}
    </Tooltip>
  )
}

function FindingSection({ section }: { readonly section: CacheFindingSection }) {
  const copy = CACHE_RECOMMENDATION_COPY[section.state]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-row items-baseline gap-2">
        <Badge variant={SECTION_VARIANT[section.state]} size="small">
          {copy.title}
        </Badge>
        <Text.H6 color="foregroundMuted">{copy.body}</Text.H6>
      </div>
      <div className="flex flex-col gap-1">
        {section.rows.map((row) => (
          <div
            key={`${row.provider}/${row.model}`}
            className="flex flex-row items-center gap-3 rounded-md bg-secondary/40 px-2 py-1.5"
          >
            <div className="flex w-40 shrink-0 flex-row items-center gap-1.5">
              <Text.H5 color="foreground" ellipsis noWrap>
                {row.model || "unknown model"}
              </Text.H5>
              {row.verdictDependsOnLifetime ? (
                <Tooltip
                  asChild
                  trigger={
                    <span className="inline-flex shrink-0 cursor-default">
                      <Icon icon={ClockIcon} size="sm" color="foregroundMuted" />
                    </span>
                  }
                >
                  Our estimate for this model changes if the cache time does. Try the control above.
                </Tooltip>
              ) : null}
            </div>
            <div className="min-w-0 max-w-[16rem] flex-1">
              <RecoverableBar row={row} />
            </div>
            <div className="flex-1" />
            <Text.H5 color="foreground" noWrap className="w-16 shrink-0 text-right tabular-nums">
              {row.judgment.modeledSavingsMicrocents === null
                ? DASH
                : formatPrice(microcentsToUsd(row.judgment.modeledSavingsMicrocents))}
            </Text.H5>
          </div>
        ))}
        {section.hiddenCount > 0 ? (
          <Text.H6 color="foregroundMuted">{`${formatCount(section.hiddenCount)} more, saving less`}</Text.H6>
        ) : null}
      </div>
    </div>
  )
}

type CacheSortColumn = "name" | "position" | "savings" | "spend"

/**
 * Actual against break-even against the achievable ceiling on one shared 0-100% track.
 * The shared axis is the point of this table: it is the only place two models' rates can
 * be compared, which is why the findings above encode money instead.
 */
function PositionBar({ row }: { readonly row: CacheRowView }) {
  const { actualRate: actual, breakEvenRate: breakEven, ceilingRate: ceiling } = row.judgment
  // A rate we declined to judge must not be the loudest mark on its own row.
  const unjudged = row.judgment.state === "notEnoughData"
  const pct = (value: number): number => Math.max(0, Math.min(100, value * 100))
  const actualPct = pct(actual ?? 0)
  const headroomPct = ceiling === null ? 0 : Math.max(0, pct(ceiling) - actualPct)

  return (
    <Tooltip
      asChild
      trigger={
        <div className="flex w-full cursor-default flex-row items-center gap-2">
          <div className="relative h-2 w-full overflow-hidden rounded-sm bg-muted">
            {unjudged || headroomPct <= 0 ? null : (
              <div
                className="absolute inset-y-0 opacity-25"
                style={{ left: `${actualPct}%`, width: `${headroomPct}%`, backgroundColor: CALLS_SERIES_COLOR }}
                aria-hidden="true"
              />
            )}
            {actualPct <= 0 ? null : (
              <div
                className={cn("absolute inset-y-0 left-0", { "bg-muted-foreground/40": unjudged })}
                style={{ width: `${actualPct}%`, ...(unjudged ? {} : { backgroundColor: CALLS_SERIES_COLOR }) }}
                aria-hidden="true"
              />
            )}
            {breakEven === null || breakEven <= 0 || unjudged ? null : (
              <div
                className="absolute inset-y-0 w-0.5 bg-foreground"
                style={{ left: `${pct(breakEven)}%` }}
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
        `${actual === null ? DASH : formatPercentage(actual)} of these prompts came from cache.`,
        ceiling === null
          ? "We cannot tell how much could, because this model's provider does not publish a cache time."
          : `The most this traffic could reach is ${formatPercentage(ceiling)}, because of how far apart the calls arrive.`,
      ].join("\n")}
    </Tooltip>
  )
}

function CacheTable({
  economics,
  selection,
}: {
  readonly economics: CacheEconomicsRecord
  readonly selection: CacheLifetimeSelection
}) {
  const [sort, setSort] = useState<{ column: CacheSortColumn; direction: "asc" | "desc" }>({
    column: "savings",
    direction: "desc",
  })
  const onSort = (column: CacheSortColumn) =>
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === "desc" ? "asc" : "desc" }
        : { column, direction: column === "name" ? "asc" : "desc" },
    )

  const resolved = economics.rows.map((row) => resolveCacheRow(row, selection))
  const factor = sort.direction === "desc" ? 1 : -1
  const sorted = [...sortCacheRowsBySavings(resolved)].sort((a, b) => {
    if (sort.column === "name") return a.model.localeCompare(b.model) * -factor
    if (sort.column === "position") return ((b.judgment.actualRate ?? 0) - (a.judgment.actualRate ?? 0)) * factor
    if (sort.column === "spend") return (b.costMicrocents - a.costMicrocents) * factor
    return ((b.judgment.modeledSavingsMicrocents ?? -1) - (a.judgment.modeledSavingsMicrocents ?? -1)) * factor
  })
  const rows = sorted.slice(0, CACHE_ROWS_SHOWN)
  const hidden = economics.totals.distinctModels - rows.length
  const headProps = { sort, onSort }

  return (
    <div className="flex flex-col gap-2">
      <Table wrapperClassName="border-0 rounded-none">
        <TableHeader className="[&_tr]:border-b-0">
          <TableRow hoverable={false}>
            <CostTableHead column="name" label="Model" align="left" isFirst alphabetical {...headProps} />
            <CostTableHead
              column="position"
              label="Position"
              align="left"
              isFirst={false}
              tooltipMessage="How much of each prompt came from cache, and how much could have."
              {...headProps}
            />
            <CostTableHead column="savings" label="Est. savings" align="right" isFirst={false} {...headProps} />
            <CostTableHead column="spend" label="Spend" align="right" isFirst={false} {...headProps} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const spend = rollupCostDisplay({
              costTotalMicrocents: row.costMicrocents,
              unpricedSpanCount: row.unpricedCalls,
              tokensTotal: row.inputTokens + row.cacheReadTokens + row.cacheCreateTokens,
            })
            const meta = STATE_META[row.judgment.state]
            return (
              <TableRow key={`${row.provider}/${row.model}`} className="border-background bg-secondary/40">
                <TableCell>
                  <div className="flex min-w-0 flex-col gap-1">
                    <Text.H5 color="foreground" ellipsis noWrap>
                      {row.model || "unknown model"}
                    </Text.H5>
                    <div className="flex flex-row items-center gap-2">
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
                      <Text.H6 color="foregroundMuted" ellipsis noWrap>
                        {row.provider || "unknown provider"}
                      </Text.H6>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <PositionBar row={row} />
                </TableCell>
                <TableCell align="right">
                  <Text.H5
                    color={row.judgment.savingsClearsFloor ? "foreground" : "foregroundMuted"}
                    noWrap
                    className="tabular-nums"
                  >
                    {row.judgment.modeledSavingsMicrocents === null
                      ? DASH
                      : formatPrice(microcentsToUsd(row.judgment.modeledSavingsMicrocents))}
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
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex flex-row items-center gap-3">
          <div className="flex flex-row items-center gap-1.5">
            <span className="h-2.5 w-0.5 shrink-0 bg-foreground" aria-hidden="true" />
            <Text.H6 color="foregroundMuted" noWrap>
              Break-even
            </Text.H6>
          </div>
          <div className="flex flex-row items-center gap-1.5">
            <span
              className="h-2 w-3 shrink-0 rounded-sm opacity-25"
              style={{ backgroundColor: CALLS_SERIES_COLOR }}
              aria-hidden="true"
            />
            <Text.H6 color="foregroundMuted" noWrap>
              Reachable headroom
            </Text.H6>
          </div>
        </div>
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
 * Whether each model's caching is paying for itself, and what closing the gap is worth.
 *
 * Findings come first, grouped by what to do about them. The per-model comparison sits
 * behind a toggle, because a reader arriving here wants to know what to fix before they
 * want to compare nineteen models.
 */
export function CacheEconomicsPanel({
  economics,
  isLoading,
}: {
  readonly economics: CacheEconomicsRecord | undefined
  readonly isLoading: boolean
}) {
  const [selection, setSelection] = useState<CacheLifetimeSelection>("documented")
  const [showTable, setShowTable] = useState(false)

  const sections = economics ? buildCacheFindings(economics.rows, selection) : []
  const settled = economics ? summariseSettledRows(economics.rows, selection) : { fine: 0, needData: 0 }
  const totalSavings = sections.reduce((sum, section) => sum + section.savingsMicrocents, 0)

  const settledSummary = [
    settled.fine > 0
      ? `${formatCount(settled.fine)} ${settled.fine === 1 ? "model is" : "models are"} caching well`
      : null,
    settled.needData > 0 ? `${formatCount(settled.needData)} have too little traffic to judge yet` : null,
  ]
    .filter((part) => part !== null)
    .join(". ")

  return (
    // The table's row separators are painted in `--background`, so the card must carry it.
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        {totalSavings > 0 ? (
          <Tooltip
            asChild
            trigger={
              <div className="flex cursor-default flex-row items-baseline gap-1.5">
                <Text.H4B color="foreground" noWrap className="tabular-nums">
                  {formatPrice(microcentsToUsd(totalSavings))}
                </Text.H4B>
                <Text.H6 color="foregroundMuted" noWrap>
                  looks recoverable
                </Text.H6>
                <Icon icon={InfoIcon} size="sm" color="foregroundMuted" />
              </div>
            }
          >
            {SAVINGS_TOOLTIP}
          </Tooltip>
        ) : (
          <Text.H6 color="foregroundMuted">Nothing to recover in this window</Text.H6>
        )}
        <div className="flex flex-row items-center gap-2">
          <Text.H6 color="foregroundMuted" noWrap>
            Cache lifetime
          </Text.H6>
          <Select
            name="cacheLifetime"
            value={selection === "documented" ? "documented" : String(selection)}
            onChange={(value) => setSelection(value === "documented" ? "documented" : Number(value))}
            options={CACHE_LIFETIME_OPTIONS.map((option) => ({
              label: lifetimeOptionLabel(option),
              value: option === "documented" ? "documented" : String(option),
            }))}
          />
          <Tooltip
            asChild
            trigger={
              <span className="inline-flex cursor-default">
                <Icon icon={InfoIcon} size="sm" color="foregroundMuted" />
              </span>
            }
          >
            {LIFETIME_TOOLTIP}
          </Tooltip>
        </div>
      </div>

      {isLoading || !economics ? (
        <TableSkeleton rows={4} cols={4} />
      ) : economics.rows.length === 0 ? (
        <div className="flex w-full min-h-[120px] items-center justify-center">
          <Text.H6 color="foregroundMuted">No billable model usage in this time window</Text.H6>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sections.length === 0 ? (
            <Text.H6 color="foregroundMuted">
              Nothing to change here. Every model with enough data is caching sensibly.
            </Text.H6>
          ) : (
            sections.map((section) => <FindingSection key={section.state} section={section} />)
          )}
          <div className="flex flex-row flex-wrap items-center justify-between gap-2">
            <Text.H6 color="foregroundMuted">{settledSummary}</Text.H6>
            <Button variant="link" size="sm" onClick={() => setShowTable(!showTable)}>
              {showTable ? "Hide models" : `Compare all ${formatCount(economics.totals.distinctModels)} models`}
            </Button>
          </div>
          {showTable ? <CacheTable economics={economics} selection={selection} /> : null}
        </div>
      )}
    </div>
  )
}
