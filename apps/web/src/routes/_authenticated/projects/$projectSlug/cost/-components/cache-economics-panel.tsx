import { CACHE_ECONOMICS_MIN_CALLS, CACHE_MIN_CACHEABLE_INPUT_TOKENS } from "@domain/spans"
import type { TextColor } from "@repo/ui"
import {
  cn,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableSkeleton,
  Tabs,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, formatPercentage, formatPrice } from "@repo/utils"
import {
  CircleCheckIcon,
  CircleIcon,
  CircleSlashIcon,
  ClockIcon,
  GaugeIcon,
  InfoIcon,
  SearchIcon,
  TableIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Fragment, useState } from "react"
import type { CacheEconomicsRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { rollupCostDisplay } from "../../../../../../domains/spans/cost-display.ts"
import {
  buildCacheStateGroups,
  buildCacheSummary,
  CACHE_LIFETIME_OPTIONS,
  type CacheGroupKey,
  type CacheLifetimeSelection,
  type CacheRowView,
  type CacheStateGroup,
  type CacheSummary,
  parseCacheLifetimeSelection,
  recoverableShare,
} from "./cache-economics-view.ts"
import { microcentsToUsd } from "./cost-formatters.ts"
import { CALLS_SERIES_COLOR } from "./cost-series-colors.ts"
import { CostTableHead } from "./cost-table-head.tsx"

const DASH = "—"

/**
 * What each heading is called and what it asks for.
 *
 * The heading says it once, which is what lets the rows underneath stay on a single line.
 */
const STATE_META: Record<
  CacheGroupKey,
  {
    readonly label: string
    readonly body: string
    /** The same thing in a tile's worth of words. */
    readonly short: string
    readonly icon: typeof CircleIcon
    readonly iconColor: TextColor
  }
> = {
  cacheIt: {
    label: "Cache it",
    body: "Caching is off on calls where turning it on looks like it would pay for itself.",
    short: "Caching is off where it would pay.",
    icon: TriangleAlertIcon,
    iconColor: "warningMutedForeground",
  },
  stopCaching: {
    label: "Stop caching",
    body: "These calls pay to write a cache that expires before anything reads it.",
    short: "Paying to write caches that expire unread.",
    icon: CircleSlashIcon,
    iconColor: "destructive",
  },
  investigate: {
    label: "Investigate",
    // Timing is measured; the prompt is not. Naming the prompt as the cause is a deduction
    // from having ruled timing out, so the copy hands it over rather than asserting it.
    body: "These calls arrive close enough together to reuse a cached prompt, and miss anyway. Worth a look at what changes between them.",
    short: "The timing allows it; something in the prompt does not.",
    icon: SearchIcon,
    iconColor: "warningMutedForeground",
  },
  optimal: {
    label: "Caching well",
    body: "Nothing to change on these.",
    short: "Nothing to change.",
    icon: CircleCheckIcon,
    iconColor: "success",
  },
  nothingToDo: {
    label: "Nothing to do",
    body: "A cache would not pay off on these, or there are too few calls to tell yet.",
    short: "No cache would pay, or too few calls to tell.",
    icon: CircleIcon,
    iconColor: "foregroundMuted",
  },
}

const LIFETIME_TOOLTIP =
  "Play with the cache time to see how our estimate changes. By model uses what each provider publishes: a day for most OpenAI models, which keep entries that long at no extra cost, and five minutes for Claude. The other values are what-ifs — a day is longer than Anthropic offers at all."

const SAVINGS_TOOLTIP =
  "An estimate for the time window you picked, worked out from your token counts and each model's list prices. It will not match the spend figures elsewhere on this page exactly."

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
  const meta = STATE_META[group.key]
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
      {/* Both numbers, so the pale half of the bar needs no legend to be readable. */}
      <div className="flex w-24 shrink-0 flex-row items-baseline justify-end gap-1">
        <Text.H6 color="foregroundMuted" noWrap className="tabular-nums">
          {actual === null ? DASH : formatPercentage(actual)}
        </Text.H6>
        {/* Only where there is headroom to name: "4% of 0%" is not a sentence. */}
        {ceiling === null || unjudged || ceiling <= (actual ?? 0) ? null : (
          <Text.H6 color="foregroundMuted" noWrap className="opacity-60">
            {`of ${formatPercentage(ceiling)}`}
          </Text.H6>
        )}
      </div>
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

/** The two views of one dataset: a few numbers, or every model. */
type CacheView = "summary" | "models"

const CACHE_VIEW_OPTIONS = [
  { key: "summary" as CacheView, label: "Summary", icon: GaugeIcon },
  { key: "models" as CacheView, label: "All models", icon: TableIcon },
]

/**
 * The summary always shows these three, in this order, however the lifetime is set.
 *
 * A tile that vanishes when a state empties out reshuffles the grid on every switch of the
 * cache time, and the reader loses the thing they were comparing. Ordering by money would do
 * the same, so the order is fixed even though the table's is not: worst first — paying for
 * nothing, then paying for less than you could, then not caching at all.
 */
const CACHE_FINDING_TILES: readonly CacheGroupKey[] = ["stopCaching", "investigate", "cacheIt"]

/**
 * One finding as a number to act on. The bar is its share of the recoverable total, so the
 * tiles can be ranked at a glance without reading the figures.
 */
function FindingTile({
  tileKey,
  group,
  recoverableMicrocents,
}: {
  readonly tileKey: CacheGroupKey
  /** Null when no model is in this state at the selected lifetime. */
  readonly group: CacheStateGroup | null
  readonly recoverableMicrocents: number
}) {
  const meta = STATE_META[tileKey]
  const share = group && recoverableMicrocents > 0 ? group.savingsMicrocents / recoverableMicrocents : 0

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-secondary/60 p-3">
      <div className="flex flex-row items-center gap-1.5">
        <Icon icon={meta.icon} size="sm" color={group ? meta.iconColor : "foregroundMuted"} />
        <Text.H6
          weight="semibold"
          color={group ? "foreground" : "foregroundMuted"}
          noWrap
          className="uppercase tracking-wide"
        >
          {meta.label}
        </Text.H6>
      </div>
      <Text.H4B color={group ? "foreground" : "foregroundMuted"} noWrap className="tabular-nums">
        {group ? formatPrice(microcentsToUsd(group.savingsMicrocents)) : DASH}
      </Text.H4B>
      <div className="h-1.5 w-full overflow-hidden rounded-sm bg-muted">
        {group ? (
          <div
            className="h-full"
            style={{ width: `${Math.max(2, share * 100)}%`, backgroundColor: CALLS_SERIES_COLOR }}
            aria-hidden="true"
          />
        ) : null}
      </div>
      <Text.H6 color="foregroundMuted">
        {group
          ? `${formatCount(group.rows.length)} ${group.rows.length === 1 ? "model" : "models"} · ${meta.short}`
          : "No models"}
      </Text.H6>
    </div>
  )
}

/** Where the project sits overall, on the track and colours the table rows already use. */
function CacheUseTile({ summary }: { readonly summary: CacheSummary }) {
  const pct = (value: number): number => Math.max(0, Math.min(100, value * 100))

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-secondary/60 p-3">
      <Text.H6 weight="semibold" color="foreground" noWrap className="uppercase tracking-wide">
        Cached tokens
      </Text.H6>
      <div className="flex flex-row items-baseline gap-2">
        <Text.H4B color="foreground" noWrap className="tabular-nums">
          {summary.actualRate === null ? DASH : formatPercentage(summary.actualRate)}
        </Text.H4B>
        {summary.ceilingRate === null ? null : (
          <Text.H6 color="foregroundMuted" noWrap>
            {`of a possible ${formatPercentage(summary.ceilingRate)}`}
          </Text.H6>
        )}
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-sm bg-muted">
        {summary.ceilingRate === null ? null : (
          <div
            className="absolute inset-y-0 left-0 opacity-25"
            style={{ width: `${pct(summary.ceilingRate)}%`, backgroundColor: CALLS_SERIES_COLOR }}
            aria-hidden="true"
          />
        )}
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${pct(summary.actualRate ?? 0)}%`, backgroundColor: CALLS_SERIES_COLOR }}
          aria-hidden="true"
        />
      </div>
      <Text.H6 color="foregroundMuted">
        {summary.ceilingRate === null
          ? "How much of your prompts came from cache."
          : `The pale bar is what the timing of your calls would allow${
              // Models with no measurable cadence are left out of the ceiling rather than
              // counted as nothing, so say how much of the traffic it covers.
              summary.measuredTokenShare < 0.99
                ? `, measured on ${formatPercentage(summary.measuredTokenShare)} of your tokens`
                : ""
            }.`}
      </Text.H6>
    </div>
  )
}

/**
 * Every tile in one grid rather than a row of two above a row of three: separate rows put
 * the second tile's left edge in a different place on each line, which reads as a mistake.
 * The headline takes two of the three columns, so every edge lands on the same grid.
 */
/**
 * What a chosen lifetime does not account for.
 *
 * Only on a chosen one, never on `By model`: the providers that offer a longer lifetime
 * charge for it — Anthropic doubles the write price for an hour, Gemini bills explicit
 * cache storage — and the registry carries only the short-lifetime write price, so the
 * savings above are optimistic in exactly the direction the reader just leaned.
 */
function ChosenLifetimeNote({ selection }: { readonly selection: CacheLifetimeSelection }) {
  if (selection === "documented") return null
  return (
    <Text.H6 color="foregroundMuted" className="lg:col-span-3">
      {`Assuming every model holds a cached prompt for ${formatLifetime(selection) ?? selection}. Providers that charge more to hold one that long, like Anthropic's hourly cache at double the write price, are not priced in here.`}
    </Text.H6>
  )
}

function CacheSummaryView({
  summary,
  selection,
}: {
  readonly summary: CacheSummary
  readonly selection: CacheLifetimeSelection
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="flex flex-col gap-2 rounded-lg bg-secondary/60 p-3 lg:col-span-2">
        <Tooltip
          asChild
          trigger={
            <div className="flex w-fit cursor-default flex-row items-center gap-1.5">
              <Text.H6 weight="semibold" color="foreground" noWrap className="uppercase tracking-wide">
                Looks recoverable
              </Text.H6>
              <Icon icon={InfoIcon} size="sm" color="foregroundMuted" />
            </div>
          }
        >
          {SAVINGS_TOOLTIP}
        </Tooltip>
        <Text.H3M color="foreground" noWrap className="tabular-nums">
          {formatPrice(microcentsToUsd(summary.recoverableMicrocents))}
        </Text.H3M>
        <Text.H6 color="foregroundMuted">
          {summary.recoverableShareOfSpend === null
            ? "Modeled from your tokens and each model's list prices."
            : `${formatPercentage(summary.recoverableShareOfSpend)} of what you spend here, modeled from your token counts.`}
        </Text.H6>
      </div>
      <CacheUseTile summary={summary} />
      {CACHE_FINDING_TILES.map((tileKey) => (
        <FindingTile
          key={tileKey}
          tileKey={tileKey}
          group={summary.findings.find((group) => group.key === tileKey) ?? null}
          recoverableMicrocents={summary.recoverableMicrocents}
        />
      ))}
      <ChosenLifetimeNote selection={selection} />
    </div>
  )
}

/**
 * Whether each model's caching is paying for itself, and what closing the gap is worth.
 *
 * Two views of one dataset: a handful of numbers, and every model grouped by what to do
 * about it. Nobody lands on the table by accident, which is why it holds nothing back once
 * opened — no second expand step inside it.
 */
export function CacheEconomicsPanel({
  economics,
  isLoading,
}: {
  readonly economics: CacheEconomicsRecord | undefined
  readonly isLoading: boolean
}) {
  const [selection, setSelection] = useState<CacheLifetimeSelection>("documented")
  const [view, setView] = useState<CacheView>("summary")
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

  const summary = economics ? buildCacheSummary({ rows: economics.rows, totals: economics.totals, selection }) : null

  // A sort moves the groups as well as the rows, each group carried by its leading row on
  // the sorted column — otherwise sorting by spend leaves the biggest spender three headings
  // down. So sorting by rate does put `Caching well` on top, which is the point of asking.
  //
  // What keeps that honest is `compareNullsLast`: the groups with nothing to show on the
  // sorted column sink, so a rate we declined to judge can never outrank a real one, and
  // the default savings sort still leads with the money.
  const compare = compareRows(sort)
  const groups = (economics ? buildCacheStateGroups(economics.rows, selection) : [])
    .map((group) => ({ ...group, rows: [...group.rows].sort(compare) }))
    .sort((a, b) => (a.rows[0] && b.rows[0] ? compare(a.rows[0], b.rows[0]) : 0))

  const headProps = { sort, onSort }

  return (
    // The table's row separators are painted in `--background`, so the card must carry it.
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <Tabs<CacheView>
          variant="bordered"
          size="sm"
          className="border-none bg-muted"
          indicatorClassName="border-none"
          options={CACHE_VIEW_OPTIONS.map((option) => ({
            id: option.key,
            label: option.label,
            icon: <Icon icon={option.icon} size="sm" color={view === option.key ? "foreground" : "foregroundMuted"} />,
          }))}
          active={view}
          onSelect={setView}
        />
        <div className="flex flex-row items-center gap-2">
          <Text.H6 color="foregroundMuted" noWrap>
            Cache lifetime
          </Text.H6>
          <Tabs
            variant="bordered"
            size="sm"
            className="border-none bg-muted"
            indicatorClassName="border-none"
            options={CACHE_LIFETIME_OPTIONS.map((option) => ({
              id: option === "documented" ? "documented" : String(option),
              label: lifetimeOptionLabel(option),
            }))}
            active={selection === "documented" ? "documented" : String(selection)}
            onSelect={(value) => setSelection(parseCacheLifetimeSelection(value))}
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

      {isLoading || !economics || !summary ? (
        <TableSkeleton rows={4} cols={4} />
      ) : economics.rows.length === 0 ? (
        <div className="flex w-full min-h-[120px] items-center justify-center">
          <Text.H6 color="foregroundMuted">No billable model usage in this time window</Text.H6>
        </div>
      ) : view === "summary" ? (
        <CacheSummaryView summary={summary} selection={selection} />
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
            {groups.map((group) => (
              <Fragment key={group.key}>
                <StateGroupHeader group={group} />
                {group.rows.map((row) => (
                  <CacheRow key={`${row.provider}/${row.model}`} row={row} />
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
