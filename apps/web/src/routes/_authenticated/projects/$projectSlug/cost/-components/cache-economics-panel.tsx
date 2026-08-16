import { CACHE_ECONOMICS_MIN_CALLS, CACHE_MIN_CACHEABLE_INPUT_TOKENS, cacheFindingFingerprint } from "@domain/spans"
import type { BadgeProps } from "@repo/ui"
import {
  Badge,
  cn,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Tabs,
  Text,
  Tooltip,
  useChartCssTheme,
} from "@repo/ui"
import { formatCount, formatDuration, formatPercentage, formatPrice } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import {
  ArrowUpRightIcon,
  CircleCheckIcon,
  CircleIcon,
  CircleSlashIcon,
  ClockIcon,
  GaugeIcon,
  InfoIcon,
  RadioTowerIcon,
  SearchIcon,
  TableIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useState } from "react"
import type { CacheEconomicsRecord, CacheFindingSignalRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { rollupCostDisplay } from "../../../../../../domains/spans/cost-display.ts"
import {
  buildCacheSummary,
  CACHE_LIFETIME_OPTIONS,
  type CacheGroupKey,
  type CacheLifetimeSelection,
  type CacheRowView,
  type CacheStateGroup,
  type CacheSummary,
  cacheGroupKeyForState,
  cacheStateIsActionable,
  parseCacheLifetimeSelection,
  recoverableShare,
  resolveCacheRow,
} from "./cache-economics-view.ts"
import { microcentsToUsd } from "./cost-formatters.ts"
import { callsSeriesColor, trendColor } from "./cost-series-colors.ts"
import { CostTableHead } from "./cost-table-head.tsx"
import { EmptyState } from "./empty-state.tsx"
import { SplitValue } from "./split-value.tsx"
import { useGoToModelSessions } from "./use-go-to-model-sessions.ts"

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
    /** Keeps every recommendation visually distinct in the flat "All models" table. */
    readonly badgeVariant: NonNullable<BadgeProps["variant"]>
  }
> = {
  cacheIt: {
    label: "Cache it",
    body: "Caching is off on calls where turning it on looks like it would pay for itself.",
    short: "Caching is off where it would pay.",
    icon: TriangleAlertIcon,
    badgeVariant: "warningMuted",
  },
  stopCaching: {
    label: "Stop caching",
    body: "These calls pay to write a cache that expires before anything reads it.",
    short: "Paying to write caches that expire unread.",
    icon: CircleSlashIcon,
    badgeVariant: "destructiveMuted",
  },
  investigate: {
    label: "Investigate",
    // Timing is measured; the prompt is not. Naming the prompt as the cause is a deduction
    // from having ruled timing out, so the copy hands it over rather than asserting it.
    body: "These calls arrive close enough together to reuse a cached prompt, and miss anyway. Worth a look at what changes between them.",
    short: "The timing allows it; something in the prompt does not.",
    icon: SearchIcon,
    badgeVariant: "purple",
  },
  optimal: {
    label: "Caching well",
    body: "Nothing to change on these.",
    short: "Nothing to change.",
    icon: CircleCheckIcon,
    badgeVariant: "successMuted",
  },
  nothingToDo: {
    label: "Nothing to do",
    body: "A cache would not pay off on these, or there are too few calls to tell yet.",
    short: "No cache would pay, or too few calls to tell.",
    icon: CircleIcon,
    badgeVariant: "muted",
  },
}

const LIFETIME_TOOLTIP =
  "Play with the cache time to see how our estimate changes. Received uses what each provider publishes: a day for most OpenAI models, which keep entries that long at no extra cost, and five minutes for Claude. The other values are what-ifs — a day is longer than Anthropic offers at all."

const SAVINGS_TOOLTIP =
  "An estimate for the time window you picked, worked out from your token counts and each model's list prices. It will not match the spend figures elsewhere on this page exactly."

const POSITION_TOOLTIP =
  "The share of tokens served from cache. The pale part is what the timing of these calls would have allowed."

const formatLifetime = (lifetimeSeconds: number | null): string | null =>
  lifetimeSeconds === null ? null : formatDuration(lifetimeSeconds * 1_000_000_000)

const lifetimeOptionLabel = (option: CacheLifetimeSelection): string =>
  option === "documented" ? "Received" : (formatLifetime(option) ?? String(option))

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
function PositionBar({ row, isDark }: { readonly row: CacheRowView; readonly isDark: boolean }) {
  const { actualRate: actual, breakEvenRate: breakEven, ceilingRate: ceiling } = row.judgment
  // A rate we declined to judge must not be the loudest mark on its own row.
  const unjudged = row.judgment.state === "notEnoughData"
  const pct = (value: number): number => Math.max(0, Math.min(100, value * 100))
  const actualPct = pct(actual ?? 0)
  const headroomPct = ceiling === null ? 0 : Math.max(0, pct(ceiling) - actualPct)
  const barColor = callsSeriesColor(isDark)

  return (
    <div className="flex w-full flex-row items-center gap-2">
      <div className="relative h-1 min-w-0 max-w-[150px] flex-1">
        <Tooltip
          asChild
          trigger={
            <div className="absolute inset-0 cursor-default overflow-hidden rounded-sm bg-muted">
              {unjudged || headroomPct <= 0 ? null : (
                <div
                  className="absolute inset-y-0 opacity-25"
                  style={{ left: `${actualPct}%`, width: `${headroomPct}%`, backgroundColor: barColor }}
                  aria-hidden="true"
                />
              )}
              {actualPct <= 0 ? null : (
                <div
                  className={cn("absolute inset-y-0 left-0", { "bg-muted-foreground/40": unjudged })}
                  style={{ width: `${actualPct}%`, ...(unjudged ? {} : { backgroundColor: barColor }) }}
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

/**
 * The open cost signal for this row, or null.
 *
 * Matched on the fingerprint the producer wrote, computed here by the same shared
 * function — so the panel never decides for itself which verdicts deserve escalating and
 * cannot claim a signal exists that the inbox does not hold.
 */
function signalFor(
  row: CacheRowView,
  signals: ReadonlyMap<string, CacheFindingSignalRecord>,
): CacheFindingSignalRecord | null {
  if (!cacheStateIsActionable(row.judgment.state)) return null
  // Only the documented lifetime can carry a signal; a lifetime the reader picked is their
  // assumption, and pinning the inbox's badge to it would attribute it to us.
  if (!row.isDocumented) return null
  return (
    signals.get(cacheFindingFingerprint({ provider: row.provider, model: row.model, state: row.judgment.state })) ??
    null
  )
}

/**
 * What to do about this row, standing on its own now that rows no longer sit under a heading.
 *
 * An open signal rides beside the verdict rather than next to the model name: it is that
 * recommendation escalated, and the model cell is deliberately just the model.
 */
function RecommendationCell({
  row,
  projectSlug,
  signal,
}: {
  readonly row: CacheRowView
  readonly projectSlug: string
  readonly signal: CacheFindingSignalRecord | null
}) {
  const meta = STATE_META[cacheGroupKeyForState(row.judgment.state)]
  return (
    <div className="flex min-w-0 flex-row items-center gap-1.5">
      <Tooltip
        asChild
        trigger={
          <span className="inline-flex cursor-default">
            <Badge variant={meta.badgeVariant} iconProps={{ icon: meta.icon, placement: "start" }}>
              {meta.label}
            </Badge>
          </span>
        }
      >
        {meta.body}
      </Tooltip>
      {signal ? (
        <Link
          to="/projects/$projectSlug/signals/$signalSlug"
          params={{ projectSlug, signalSlug: signal.signalSlug }}
          aria-label={`Open the ${signal.signalSlug} signal for ${row.model}`}
          className="inline-flex shrink-0"
        >
          <Badge variant="secondary" iconProps={{ icon: RadioTowerIcon, placement: "start" }}>
            {signal.signalSlug}
          </Badge>
        </Link>
      ) : null}
    </div>
  )
}

function CacheRow({
  row,
  isDark,
  onModelClick,
  projectSlug,
  signal,
}: {
  readonly row: CacheRowView
  readonly isDark: boolean
  readonly onModelClick: (model: string) => void
  readonly projectSlug: string
  readonly signal: CacheFindingSignalRecord | null
}) {
  const spend = rollupCostDisplay({
    costTotalMicrocents: row.costMicrocents,
    unpricedSpanCount: row.unpricedCalls,
    tokensTotal: row.inputTokens + row.cacheReadTokens + row.cacheCreateTokens,
  })

  return (
    <TableRow className="border-background bg-secondary/40 [&>td]:py-2.5">
      <TableCell>
        <div className="flex min-w-0 flex-row items-center gap-2">
          {row.model ? (
            <button
              type="button"
              onClick={() => onModelClick(row.model)}
              aria-label={`View sessions for ${row.model}`}
              className="group inline-flex min-w-0 items-center gap-1 text-left"
            >
              <Text.H5 color="foregroundMuted" ellipsis noWrap className="min-w-0 group-hover:text-primary">
                {row.model}
              </Text.H5>
              <Icon
                icon={ArrowUpRightIcon}
                size="xs"
                color="foregroundMuted"
                className="shrink-0 group-hover:text-primary"
              />
            </button>
          ) : (
            <Text.H5 color="foregroundMuted" ellipsis noWrap>
              unknown model
            </Text.H5>
          )}
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
        <PositionBar row={row} isDark={isDark} />
      </TableCell>
      <TableCell>
        <RecommendationCell row={row} projectSlug={projectSlug} signal={signal} />
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
 * A tile that vanishes when a state empties out reshuffles the row on every switch of the
 * cache time, and the reader loses the thing they were comparing. Ordering by money would do
 * the same, so the order is fixed even though the table's is not: worst first — paying for
 * nothing, then paying for less than you could, then not caching at all.
 */
const CACHE_FINDING_TILES = ["stopCaching", "investigate", "cacheIt"] as const
type CacheFindingKey = (typeof CACHE_FINDING_TILES)[number]

/**
 * Colours for the three findings, shared by their bar segment and their tile's icon so the
 * two read as one thing. `investigate` and `cacheIt` used to carry the same (amber) icon
 * colour in `STATE_META`, which would have made two of three bar segments indistinguishable
 * — so this is its own palette rather than reusing that one.
 */
const recommendationBarColor = (key: CacheFindingKey, isDark: boolean): string => {
  if (key === "investigate") return trendColor(isDark)
  if (key === "stopCaching") return isDark ? "oklch(57.7% 0.245 27.325)" : "oklch(70.4% 0.191 22.216)" // red-600 / red-400
  return isDark ? "oklch(64.6% 0.222 41.116)" : "oklch(75% 0.183 55.934)" // orange-600 / orange-400
}

/** One finding's number and model count, sized to sit beside its siblings. */
function RecommendationLine({
  tileKey,
  group,
  isDark,
}: {
  readonly tileKey: CacheFindingKey
  /** Null when no model is in this state at the selected lifetime. */
  readonly group: CacheStateGroup | null
  readonly isDark: boolean
}) {
  const meta = STATE_META[tileKey]
  return (
    <div className="flex w-[156px] flex-col gap-1">
      <div className="flex flex-row items-center gap-1.5">
        {group ? (
          <Icon icon={meta.icon} size="sm" style={{ color: recommendationBarColor(tileKey, isDark) }} />
        ) : (
          <Icon icon={meta.icon} size="sm" color="foregroundMuted" />
        )}
        <Text.H6M color="foregroundMuted" noWrap>
          {meta.label}
        </Text.H6M>
      </div>
      <div className="flex flex-col">
        <Text.H3M color={group ? "foreground" : "foregroundMuted"} noWrap className="tabular-nums">
          <SplitValue formatted={formatPrice(microcentsToUsd(group?.savingsMicrocents ?? 0))} />
        </Text.H3M>
        <Text.H6 color="foregroundMuted" noWrap>
          {group ? `${formatCount(group.rows.length)} ${group.rows.length === 1 ? "model" : "models"}` : "No models"}
        </Text.H6>
      </div>
    </div>
  )
}

/**
 * The three findings' savings against total spend, so the bar says how big the opportunity
 * actually is rather than just how it splits three ways. The uncoloured remainder — spend
 * the findings don't touch — is just the track's own `bg-muted`, the same grey the Cache
 * hit rate bar beside it shows under its own fill, rather than a second, separately-coloured
 * "rest" segment.
 */
function RecommendationsBar({
  groups,
  totalSpendMicrocents,
  isDark,
}: {
  readonly groups: ReadonlyMap<CacheFindingKey, CacheStateGroup | null>
  readonly totalSpendMicrocents: number
  readonly isDark: boolean
}) {
  if (totalSpendMicrocents <= 0) {
    return <div className="flex h-1 w-full overflow-hidden rounded-sm bg-muted" />
  }

  const recoverableMicrocents = CACHE_FINDING_TILES.reduce(
    (sum, key) => sum + (groups.get(key)?.savingsMicrocents ?? 0),
    0,
  )
  // Modeled savings and recorded spend come from different places and can disagree on a
  // row priced oddly (see `recoverableShare`) — widening the denominator to whichever is
  // larger keeps the three segments proportional to each other and the bar at exactly
  // 100%, rather than letting a rare overshoot push it past its own edge.
  const denominator = Math.max(totalSpendMicrocents, recoverableMicrocents)

  return (
    <div className="flex h-1 w-full overflow-hidden rounded-sm bg-muted">
      {CACHE_FINDING_TILES.map((key) => {
        const group = groups.get(key)
        if (!group) return null
        const share = group.savingsMicrocents / denominator
        return (
          <div
            key={key}
            className="h-full"
            style={{ width: `${Math.max(0, share * 100)}%`, backgroundColor: recommendationBarColor(key, isDark) }}
            aria-hidden="true"
          />
        )
      })}
    </div>
  )
}

/** What to change, and what closing the gap on cache is worth. */
function RecommendationsCard({ summary, isDark }: { readonly summary: CacheSummary; readonly isDark: boolean }) {
  const groups = new Map(CACHE_FINDING_TILES.map((key) => [key, summary.findings.find((g) => g.key === key) ?? null]))

  return (
    <div className="flex flex-1 flex-col rounded-lg bg-secondary">
      <div className="p-5 pb-0">
        <Text.H6M color="foregroundMuted">Recommendations</Text.H6M>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-5 p-5 pt-4">
        <div className="flex flex-row gap-5">
          {CACHE_FINDING_TILES.map((key) => (
            <RecommendationLine key={key} tileKey={key} group={groups.get(key) ?? null} isDark={isDark} />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Text.H6M color="foregroundMuted">The colour is what these findings could recover from total spend</Text.H6M>
          <RecommendationsBar groups={groups} totalSpendMicrocents={summary.totalSpendMicrocents} isDark={isDark} />
        </div>
      </div>
    </div>
  )
}

/** How far the actual rate sits from what the traffic's timing would allow, worded like the design's callout. */
function HitRateCaption({ summary }: { readonly summary: CacheSummary }) {
  if (summary.actualRate === null || summary.ceilingRate === null) {
    return <Text.H6M color="foregroundMuted">How much of your prompts came from cache</Text.H6M>
  }
  const diff = summary.ceilingRate - summary.actualRate
  // Models with no measurable cadence are left out of the ceiling rather than counted as
  // nothing, so say how much of the traffic it covers.
  const measuredNote =
    summary.measuredTokenShare < 0.99
      ? `, measured on ${formatPercentage(summary.measuredTokenShare)} of your tokens`
      : ""
  return (
    <Text.H6M color="foregroundMuted">
      {"You're "}
      {diff > 0 ? <Text.H6B color="foregroundMuted">{`${formatPercentage(diff)} behind`}</Text.H6B> : "at"}
      {` the possible cache hit rate of ${formatPercentage(summary.ceilingRate)}${measuredNote}`}
    </Text.H6M>
  )
}

/**
 * Cache hit rate against what the traffic's timing would allow, and the money on the table.
 * `Potential savings` absorbs the standalone "Looks recoverable" headline this replaces —
 * its explanatory tooltip moves onto the label here rather than being dropped.
 */
function CacheHitRateCard({ summary, isDark }: { readonly summary: CacheSummary; readonly isDark: boolean }) {
  const pct = (value: number): number => Math.max(0, Math.min(100, value * 100))
  const barColor = trendColor(isDark)

  return (
    <div className="flex flex-1 flex-col rounded-lg bg-secondary">
      <div className="p-5 pb-0">
        <Text.H6M color="foregroundMuted">Cache hit rate</Text.H6M>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-5 p-5 pt-4">
        <div className="flex flex-row gap-5">
          <div className="flex w-[156px] flex-col gap-1">
            <Text.H6M color="foregroundMuted" noWrap>
              Cached tokens
            </Text.H6M>
            <div className="flex flex-col">
              <Text.H3M color="foreground" noWrap className="tabular-nums">
                {summary.actualRate === null ? DASH : <SplitValue formatted={formatPercentage(summary.actualRate)} />}
              </Text.H3M>
              <Text.H6 color="foregroundMuted" noWrap>
                {summary.ceilingRate === null ? "" : `of possible ${formatPercentage(summary.ceilingRate)}`}
              </Text.H6>
            </div>
          </div>
          <div className="flex w-[156px] flex-col gap-1">
            <Tooltip
              asChild
              trigger={
                <span className="inline-flex w-fit cursor-default">
                  <Text.H6M color="foregroundMuted" noWrap>
                    Potential savings
                  </Text.H6M>
                </span>
              }
            >
              {SAVINGS_TOOLTIP}
            </Tooltip>
            <div className="flex flex-col">
              <Text.H3M color="foreground" noWrap className="tabular-nums">
                <SplitValue formatted={formatPrice(microcentsToUsd(summary.recoverableMicrocents))} />
              </Text.H3M>
              <Text.H6 color="foregroundMuted" noWrap>
                {summary.recoverableShareOfSpend === null
                  ? ""
                  : `${formatPercentage(summary.recoverableShareOfSpend)} of total spend`}
              </Text.H6>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <HitRateCaption summary={summary} />
          <div className="relative h-1 w-full overflow-hidden rounded-sm bg-muted">
            {summary.ceilingRate === null ? null : (
              <div
                className="absolute inset-y-0 left-0 opacity-50"
                style={{ width: `${pct(summary.ceilingRate)}%`, backgroundColor: barColor }}
                aria-hidden="true"
              />
            )}
            <div
              className="absolute inset-y-0 left-0 rounded-r-full"
              style={{ width: `${pct(summary.actualRate ?? 0)}%`, backgroundColor: barColor }}
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * What a chosen lifetime does not account for.
 *
 * Only on a chosen one, never on `Received`: the providers that offer a longer lifetime
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
  isDark,
}: {
  readonly summary: CacheSummary
  readonly selection: CacheLifetimeSelection
  readonly isDark: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 lg:flex-row">
        <CacheHitRateCard summary={summary} isDark={isDark} />
        <RecommendationsCard summary={summary} isDark={isDark} />
      </div>
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
  projectSlug,
  isLoading,
  findingSignals,
}: {
  readonly economics: CacheEconomicsRecord | undefined
  readonly projectSlug: string
  readonly isLoading: boolean
  readonly findingSignals: readonly CacheFindingSignalRecord[] | undefined
}) {
  const { isDark } = useChartCssTheme()
  const goToModelSessions = useGoToModelSessions(projectSlug)
  const signalsByFingerprint = new Map((findingSignals ?? []).map((signal) => [signal.fingerprint, signal]))
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

  // One flat list, ranked by impact rather than grouped by the action it needs — a row with
  // nothing to show on the sorted column sinks via `compareNullsLast` instead of hiding under
  // its own heading, so the default savings sort still leads with the money.
  const compare = compareRows(sort)
  const rows = (economics ? economics.rows.map((row) => resolveCacheRow(row, selection)) : []).sort(compare)

  const headProps = { sort, onSort }

  return (
    // The table's row separators are painted in `--background`, so the card must carry it.
    <div className="flex flex-col gap-3 bg-background">
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
        <EmptyState icon={TableIcon} message="No billable model usage in this time window" />
      ) : view === "summary" ? (
        <CacheSummaryView summary={summary} selection={selection} isDark={isDark} />
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
              {/* Hand-rolled rather than `CostTableHead`: this column has no sort. */}
              <TableHead align="left" className="border-l border-border bg-transparent">
                <Text.H5M color="foregroundMuted" noWrap>
                  Recommendation
                </Text.H5M>
              </TableHead>
              <CostTableHead column="savings" label="Est. savings" align="right" isFirst={false} {...headProps} />
              <CostTableHead column="spend" label="Spend" align="right" isFirst={false} {...headProps} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <CacheRow
                key={`${row.provider}/${row.model}`}
                row={row}
                isDark={isDark}
                onModelClick={goToModelSessions}
                projectSlug={projectSlug}
                signal={signalFor(row, signalsByFingerprint)}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
