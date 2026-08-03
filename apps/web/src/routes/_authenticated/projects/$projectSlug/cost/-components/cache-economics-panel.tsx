import { CACHE_ECONOMICS_MIN_CALLS, CACHE_MIN_CACHEABLE_INPUT_TOKENS, type CacheState } from "@domain/spans"
import type { TextColor } from "@repo/ui"
import {
  Button,
  cn,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableSkeleton,
  TabSelector,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, formatPercentage, formatPrice } from "@repo/utils"
import {
  CircleCheckIcon,
  CircleIcon,
  CircleSlashIcon,
  ClockIcon,
  InfoIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Fragment, useState } from "react"
import type { CacheEconomicsRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { rollupCostDisplay } from "../../../../../../domains/spans/cost-display.ts"
import {
  buildCacheStateGroups,
  CACHE_LIFETIME_OPTIONS,
  type CacheLifetimeSelection,
  type CacheRowView,
  type CacheStateGroup,
  parseCacheLifetimeSelection,
  recoverableShare,
  summariseSettledRows,
} from "./cache-economics-view.ts"
import { microcentsToUsd } from "./cost-formatters.ts"
import { CALLS_SERIES_COLOR } from "./cost-series-colors.ts"
import { CostTableHead } from "./cost-table-head.tsx"

const DASH = "—"

/** Collapsed, each group shows its leading row. The rest arrive when someone expands. */
const ROWS_PER_GROUP_COLLAPSED = 1

/**
 * What each state is called and what it asks for.
 *
 * The group heading says the state once, which is what lets the rows underneath stay on a
 * single line.
 */
const STATE_META: Record<
  CacheState,
  { readonly label: string; readonly body: string; readonly icon: typeof CircleIcon; readonly iconColor: TextColor }
> = {
  cacheIt: {
    label: "Cache it",
    body: "Caching is off on calls where turning it on looks like it would pay for itself.",
    icon: TriangleAlertIcon,
    iconColor: "warningMutedForeground",
  },
  stopCaching: {
    label: "Stop caching",
    body: "These calls pay to write a cache that expires before anything reads it.",
    icon: CircleSlashIcon,
    iconColor: "destructive",
  },
  investigate: {
    label: "Investigate",
    // Timing is measured; the prompt is not. Naming the prompt as the cause is a deduction
    // from having ruled timing out, so the copy hands it over rather than asserting it.
    body: "These calls arrive close enough together to reuse a cached prompt, and miss anyway. Worth a look at what changes between them.",
    icon: SearchIcon,
    iconColor: "warningMutedForeground",
  },
  optimal: {
    label: "Caching well",
    body: "Nothing to change on these.",
    icon: CircleCheckIcon,
    iconColor: "success",
  },
  correctlyOff: {
    label: "Right to skip the cache",
    body: "These prompts are too short, or arrive too far apart, for a cache to pay off.",
    icon: CircleIcon,
    iconColor: "foregroundMuted",
  },
  notEnoughData: {
    label: "Too little traffic to judge",
    body: "Not enough calls yet to say anything useful.",
    icon: CircleIcon,
    iconColor: "foregroundMuted",
  },
}

const LIFETIME_TOOLTIP =
  "Play with the cache time to see how our estimate changes. Every value here is a guess, including the default, which uses what each provider publishes for the model."

const SAVINGS_TOOLTIP =
  "An estimate, worked out from your token counts and each model's list prices. It will not match the spend figures elsewhere on this page exactly."

const POSITION_TOOLTIP =
  "The share of tokens served from cache. The pale part is what the timing of these calls would have allowed."

const formatLifetime = (lifetimeSeconds: number | null): string | null =>
  lifetimeSeconds === null ? null : formatDuration(lifetimeSeconds * 1_000_000_000)

const lifetimeOptionLabel = (option: CacheLifetimeSelection): string =>
  option === "documented" ? "By model" : (formatLifetime(option) ?? String(option))

const avgInputTokensPerCall = (row: CacheRowView): number =>
  row.calls > 0 ? (row.inputTokens + row.cacheReadTokens + row.cacheCreateTokens) / row.calls : 0

/** Why this row sits in its group, for the reader who wants the specific reason. */
function rowExplanation(row: CacheRowView): string {
  const ceiling = row.judgment.ceilingRate === null ? null : formatPercentage(row.judgment.ceilingRate)
  const actual = formatPercentage(row.judgment.actualRate ?? 0)
  switch (row.judgment.state) {
    case "optimal":
      return `${actual} of these prompts came from cache, close to the most this traffic could reach.`
    case "cacheIt":
      // A null ceiling here means the cadence went unmeasured, and the reason this is
      // still a recommendation is that the model charges nothing extra to write.
      return ceiling === null
        ? "Caching is off, and this model charges nothing extra to write one, so turning it on cannot cost more."
        : `Caching is off here, and this traffic could serve ${ceiling} of the prompt from cache.`
    case "stopCaching":
      return "The calls arrive too far apart to read an entry back before it expires, so the writes buy nothing."
    case "investigate":
      return `${actual} came from cache where the timing of these calls would allow ${ceiling}. We compare when calls arrive, never what they contain, so the prompt is where to look next.`
    case "correctlyOff":
      if (avgInputTokensPerCall(row) < CACHE_MIN_CACHEABLE_INPUT_TOKENS) {
        return `Prompts average ${formatCount(Math.round(avgInputTokensPerCall(row)))} tokens, under the ${formatCount(CACHE_MIN_CACHEABLE_INPUT_TOKENS)} providers will cache at all.`
      }
      return `This traffic tops out at ${ceiling ?? "a rate too low to pay off"}, so leaving caching off is cheaper.`
    case "notEnoughData":
      if (row.judgment.breakEvenRate === null) return "This model's provider does not publish cache prices."
      if (row.calls < CACHE_ECONOMICS_MIN_CALLS)
        return `${formatCount(row.calls)} calls is too few to read anything into the rate.`
      return "Caching is off, and we cannot tell how much of this traffic could use one."
  }
}

/**
 * An eyebrow heading, matching the signals inbox: icon, label, count, and a hairline
 * filling the rest of the width. Deliberately not a filled band, which reads as another row.
 */
function StateGroupHeader({ group }: { readonly group: CacheStateGroup }) {
  const meta = STATE_META[group.state]
  return (
    <TableRow hoverable={false} className="border-0">
      <TableCell colSpan={4} className="max-w-none px-3 pt-8 pb-2.5 align-bottom">
        <div className="flex w-full flex-col gap-1">
          <div className="flex flex-row items-center gap-2">
            <Icon icon={meta.icon} size="sm" color={meta.iconColor} />
            <Text.H6 weight="semibold" color="foreground" noWrap className="uppercase tracking-wide">
              {meta.label}
            </Text.H6>
            <Text.H6 color="foregroundMuted">{formatCount(group.rows.length)}</Text.H6>
            <div className="h-px min-w-4 flex-1 bg-border" />
          </div>
          <Text.H6 color="foregroundMuted">{meta.body}</Text.H6>
        </div>
      </TableCell>
    </TableRow>
  )
}

/**
 * Where caching starts paying for itself on this model, as a goalpost standing over the
 * track.
 *
 * It overhangs the bar rather than sitting inside it: a mark flush with the fill reads as a
 * segment boundary, and it carries its own tooltip because a threshold nobody can name is
 * worse than no threshold at all. Hence a sibling of the bar's trigger, not a child — a
 * nested trigger would open both tooltips at once.
 *
 * A break-even of zero draws nothing: there is no threshold to clear, and against the left
 * edge it reads as an artefact.
 */
function BreakEvenMark({ breakEvenRate }: { readonly breakEvenRate: number }) {
  return (
    <Tooltip
      asChild
      trigger={
        <span
          className="absolute -top-1.5 flex h-5 w-3 -translate-x-1/2 cursor-default items-center justify-center"
          style={{ left: `${Math.min(100, breakEvenRate * 100)}%` }}
        >
          <span className="h-4 w-[3px] rounded-full bg-foreground/70" />
        </span>
      }
    >
      {`Caching starts paying for itself on this model once ${formatPercentage(breakEvenRate)} of the tokens come from cache.`}
    </Tooltip>
  )
}

/**
 * What came from cache, against what could have, on one shared 0-100% track. The shared
 * axis is the point of the table: it is the only place two models' rates can be compared.
 *
 * Segments are square and clipped by the track, or a rounded corner cuts a notch into the
 * middle of the bar.
 */
function PositionBar({ row }: { readonly row: CacheRowView }) {
  const { actualRate: actual, breakEvenRate: breakEven, ceilingRate: ceiling } = row.judgment
  // A rate we declined to judge must not be the loudest mark on its own row.
  const unjudged = row.judgment.state === "notEnoughData"
  const pct = (value: number): number => Math.max(0, Math.min(100, value * 100))
  const actualPct = pct(actual ?? 0)
  const headroomPct = ceiling === null ? 0 : Math.max(0, pct(ceiling) - actualPct)

  return (
    <div className="flex w-full flex-row items-center gap-2">
      <div className="relative h-2 min-w-0 flex-1">
        <Tooltip
          asChild
          trigger={
            <div className="absolute inset-0 cursor-default overflow-hidden rounded-sm bg-muted">
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
            </div>
          }
        >
          {rowExplanation(row)}
        </Tooltip>
        {breakEven === null || breakEven <= 0 || unjudged ? null : <BreakEvenMark breakEvenRate={breakEven} />}
      </div>
      <Text.H6 color="foregroundMuted" noWrap className="w-10 shrink-0 text-right tabular-nums">
        {actual === null ? DASH : formatPercentage(actual)}
      </Text.H6>
    </div>
  )
}

/** Money, with the share of this model's own spend folded into the tooltip. */
function SavingsCell({ row }: { readonly row: CacheRowView }) {
  const savings = row.judgment.modeledSavingsMicrocents
  if (savings === null) {
    return (
      <Text.H5 color="foregroundMuted" noWrap className="tabular-nums">
        {DASH}
      </Text.H5>
    )
  }
  const share = recoverableShare(row)
  return (
    <Tooltip
      asChild
      trigger={
        <span className="inline-flex cursor-default">
          <Text.H5
            color={row.judgment.savingsClearsFloor ? "foreground" : "foregroundMuted"}
            noWrap
            className="tabular-nums"
          >
            {formatPrice(microcentsToUsd(savings))}
          </Text.H5>
        </span>
      }
    >
      {share === null
        ? SAVINGS_TOOLTIP
        : `${formatPercentage(share)} of what you spend on this model. ${SAVINGS_TOOLTIP}`}
    </Tooltip>
  )
}

function CacheRow({ row }: { readonly row: CacheRowView }) {
  const spend = rollupCostDisplay({
    costTotalMicrocents: row.costMicrocents,
    unpricedSpanCount: row.unpricedCalls,
    tokensTotal: row.inputTokens + row.cacheReadTokens + row.cacheCreateTokens,
  })

  return (
    <TableRow className="border-background bg-secondary/40 [&>td]:py-2.5">
      <TableCell>
        <div className="flex min-w-0 flex-row items-center gap-2">
          <Text.H5 color="foreground" ellipsis noWrap>
            {row.model || "unknown model"}
          </Text.H5>
          <Text.H6 color="foregroundMuted" ellipsis noWrap>
            {row.provider || "unknown provider"}
          </Text.H6>
          {row.verdictDependsOnLifetime ? (
            <Tooltip
              asChild
              trigger={
                <span className="inline-flex shrink-0 cursor-default">
                  <Icon icon={ClockIcon} size="sm" color="foregroundMuted" />
                </span>
              }
            >
              What we say about this model changes if the cache time does. Try the control above.
            </Tooltip>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <PositionBar row={row} />
      </TableCell>
      <TableCell align="right">
        <SavingsCell row={row} />
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
}

type CacheSortColumn = "name" | "position" | "savings" | "spend"

/** A rate we declined to judge is not a low rate, so it ranks with the other blanks. */
const cachedShare = (row: CacheRowView): number | null =>
  row.judgment.state === "notEnoughData" ? null : row.judgment.actualRate

/**
 * Blanks stay at the bottom whichever way the column points, rather than flipping to the
 * top on ascending: a screen of dashes is never the answer to a sort.
 */
const compareNullsLast = (left: number | null, right: number | null, factor: number): number => {
  if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1
  return (right - left) * factor
}

const compareRows =
  (sort: { readonly column: CacheSortColumn; readonly direction: "asc" | "desc" }) =>
  (a: CacheRowView, b: CacheRowView): number => {
    const factor = sort.direction === "desc" ? 1 : -1
    if (sort.column === "name") return a.model.localeCompare(b.model) * -factor
    if (sort.column === "position") return compareNullsLast(cachedShare(a), cachedShare(b), factor)
    if (sort.column === "spend") return (b.costMicrocents - a.costMicrocents) * factor
    return compareNullsLast(a.judgment.modeledSavingsMicrocents, b.judgment.modeledSavingsMicrocents, factor)
  }

/**
 * Whether each model's caching is paying for itself, and what closing the gap is worth.
 *
 * One table, grouped by what to do about each model. Collapsed it shows the leading row of
 * every group that asks for something, which is the answer most readers came for; expanded
 * it becomes the full per-model comparison.
 */
export function CacheEconomicsPanel({
  economics,
  isLoading,
}: {
  readonly economics: CacheEconomicsRecord | undefined
  readonly isLoading: boolean
}) {
  const [selection, setSelection] = useState<CacheLifetimeSelection>("documented")
  const [isExpanded, setIsExpanded] = useState(false)
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

  const built = economics ? buildCacheStateGroups(economics.rows, selection) : []
  const settled = economics ? summariseSettledRows(economics.rows, selection) : { fine: 0, needData: 0 }
  const totalSavings = built.reduce((sum, group) => sum + (group.isActionable ? group.savingsMicrocents : 0), 0)

  // A sort moves the groups as well as the rows, each group carried by its leading row on
  // the sorted column — otherwise sorting by spend leaves the biggest spender three
  // headings down, and collapsed it would not move the table at all. So sorting by rate
  // does put `Caching well` on top, which is the point of asking for it.
  //
  // What keeps that honest is `compareNullsLast`: the groups with nothing to show on the
  // sorted column sink, so a rate we declined to judge can never outrank a real one, and
  // the default savings sort still leads with the money.
  const compare = compareRows(sort)
  const groups = built
    .map((group) => ({ ...group, rows: [...group.rows].sort(compare) }))
    .sort((a, b) => (a.rows[0] && b.rows[0] ? compare(a.rows[0], b.rows[0]) : 0))

  const visibleGroups = isExpanded ? groups : groups.filter((group) => group.isActionable)
  const rowsOf = (group: CacheStateGroup): readonly CacheRowView[] =>
    isExpanded ? group.rows : group.rows.slice(0, ROWS_PER_GROUP_COLLAPSED)

  const settledSummary = [
    settled.fine > 0 ? `${formatCount(settled.fine)} caching well` : null,
    settled.needData > 0 ? `${formatCount(settled.needData)} with too little traffic to judge` : null,
  ]
    .filter((part) => part !== null)
    .join(", ")

  const headProps = { sort, onSort }

  return (
    // The table's row separators are painted in `--background`, so the card must carry it.
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        {totalSavings > 0 ? (
          <Tooltip
            asChild
            trigger={
              <div className="flex cursor-default flex-row items-center gap-1.5">
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
          <TabSelector<string>
            selected={selection === "documented" ? "documented" : String(selection)}
            onSelect={(value) => setSelection(parseCacheLifetimeSelection(value))}
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
        <div className="flex flex-col gap-2">
          {visibleGroups.length === 0 ? (
            <Text.H6 color="foregroundMuted">
              Nothing to change here. Every model with enough data is caching sensibly.
            </Text.H6>
          ) : (
            <Table wrapperClassName="border-0 rounded-none">
              <TableHeader className="[&_tr]:border-b-0">
                <TableRow hoverable={false}>
                  <CostTableHead column="name" label="Model" align="left" isFirst alphabetical {...headProps} />
                  <CostTableHead
                    column="position"
                    label="Cached tokens"
                    align="left"
                    isFirst={false}
                    tooltipMessage={POSITION_TOOLTIP}
                    className="w-2/5"
                    {...headProps}
                  />
                  <CostTableHead column="savings" label="Est. savings" align="right" isFirst={false} {...headProps} />
                  <CostTableHead column="spend" label="Spend" align="right" isFirst={false} {...headProps} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleGroups.map((group) => (
                  <Fragment key={group.state}>
                    <StateGroupHeader group={group} />
                    {rowsOf(group).map((row) => (
                      <CacheRow key={`${row.provider}/${row.model}`} row={row} />
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="flex flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? "Show the highlights" : `Show all ${formatCount(economics.totals.distinctModels)} models`}
            </Button>
            {settledSummary ? <Text.H6 color="foregroundMuted">{`· ${settledSummary}`}</Text.H6> : null}
          </div>
        </div>
      )}
    </div>
  )
}
