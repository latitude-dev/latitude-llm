import { CACHE_ECONOMICS_MIN_CALLS, CACHE_MIN_CACHEABLE_INPUT_TOKENS, type CacheState } from "@domain/spans"
import type { BadgeProps } from "@repo/ui"
import {
  Badge,
  cn,
  DotIndicator,
  Icon,
  Select,
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
import { formatCount, formatDuration, formatPercentage, formatPrice } from "@repo/utils"
import { ClockIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"
import { useState } from "react"
import type { CacheEconomicsRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { rollupCostDisplay } from "../../../../../../domains/spans/cost-display.ts"
import {
  CACHE_LIFETIME_OPTIONS,
  CACHE_RECOMMENDATION_COPY,
  type CacheLifetimeSelection,
  type CacheRecommendation,
  type CacheRowView,
  cacheStateIsActionable,
  groupCacheRecommendations,
  resolveCacheRow,
  sortCacheRowsBySavings,
} from "./cache-economics-view.ts"
import { microcentsToUsd } from "./cost-formatters.ts"
import { CALLS_SERIES_COLOR, OTHER_SERIES_COLOR, TREND_COLOR } from "./cost-series-colors.ts"

const DASH = "—"

// Beyond this the table stops being a comparison. Rows are ranked by savings then
// spend, so what falls off is what matters least on both counts.
const CACHE_ROWS_SHOWN = 10

const STATE_META: Record<CacheState, { readonly label: string; readonly variant: BadgeProps["variant"] }> = {
  optimal: { label: "Optimal", variant: "successMuted" },
  cacheIt: { label: "Cache it", variant: "warningMuted" },
  stopCaching: { label: "Stop caching", variant: "destructiveMuted" },
  investigate: { label: "Investigate", variant: "warningMuted" },
  correctlyOff: { label: "Correctly off", variant: "muted" },
  notEnoughData: { label: "Not enough data", variant: "muted" },
}

const RECOMMENDATION_VARIANT: Record<CacheRecommendation["state"], BadgeProps["variant"]> = {
  cacheIt: "warningMuted",
  stopCaching: "destructiveMuted",
  investigate: "warningMuted",
}

const avgInputTokensPerCall = (row: CacheRowView): number =>
  row.calls > 0 ? (row.inputTokens + row.cacheReadTokens + row.cacheCreateTokens) / row.calls : 0

const formatLifetime = (lifetimeSeconds: number | null): string | null =>
  lifetimeSeconds === null ? null : formatDuration(lifetimeSeconds * 1_000_000_000)

const lifetimeOptionLabel = (option: CacheLifetimeSelection): string =>
  option === "documented" ? "Documented" : (formatLifetime(option) ?? String(option))

function stateExplanation(row: CacheRowView): string {
  const breakEven = row.judgment.breakEvenRate === null ? null : formatPercentage(row.judgment.breakEvenRate)
  const ceiling = row.judgment.ceilingRate === null ? null : formatPercentage(row.judgment.ceilingRate)
  switch (row.judgment.state) {
    case "optimal":
      return `Reads cover ${formatPercentage(row.judgment.actualRate ?? 0)} of the input, past the ${breakEven} this model needs to pay for its cache writes${ceiling === null ? "" : ` and within reach of the ${ceiling} this traffic's cadence allows`}.`
    case "cacheIt":
      return `Caching is off, and this traffic's cadence could serve ${ceiling ?? "most"} of the prompt from cache on a model that charges no write premium — so any prefix reuse is pure upside.`
    case "stopCaching":
      return `Calls arrive too far apart for an entry to be read back before it expires: the cadence tops out at ${ceiling}, below the ${breakEven} this model needs, so every write is a cost with no matching discount ever arriving.`
    case "investigate":
      return row.judgment.urgency === "overpaying"
        ? `Reads cover only ${formatPercentage(row.judgment.actualRate ?? 0)} of the input, below the ${breakEven} break-even — caching is currently costing more than not caching. The cadence could reach ${ceiling}, so the gap is not the traffic. Every lever lives in your own code, so this flags the gap rather than prescribing a fix.`
        : `The rate clears break-even, so nothing is being wasted today, but the cadence could support ${ceiling} against the ${formatPercentage(row.judgment.actualRate ?? 0)} these calls are getting.`
    case "correctlyOff":
      if (avgInputTokensPerCall(row) < CACHE_MIN_CACHEABLE_INPUT_TOKENS) {
        return `Prompts average ${formatCount(Math.round(avgInputTokensPerCall(row)))} tokens, under the ${formatCount(CACHE_MIN_CACHEABLE_INPUT_TOKENS)} the major providers will cache at all, so caching is unavailable here rather than unprofitable.`
      }
      return `This traffic's cadence tops out at ${ceiling ?? "a rate below break-even"}, so leaving caching off is the cheaper setup.`
    case "notEnoughData":
      if (row.judgment.breakEvenRate === null)
        return "No cache pricing is published for this model, so it has no break-even to compare against."
      if (row.calls < CACHE_ECONOMICS_MIN_CALLS)
        return `${formatCount(row.calls)} calls is below the ${CACHE_ECONOMICS_MIN_CALLS} a hit rate needs before it is a finding rather than a one-sample artefact.`
      return "Caching is off and this model charges a write premium, so whether caching would pay depends on how much of this traffic could hit the cache — and this window records no cadence to read that from."
  }
}

/**
 * Actual against break-even against the achievable ceiling on one shared 0-100%
 * track: three numbers as position on the same axis rather than three more numeric
 * columns, which is what makes the comparison readable down the table. Raw values
 * move to the hover.
 *
 * The span between actual and ceiling is drawn as unclaimed headroom, so the row's
 * story is the gap rather than any single mark.
 */
function PositionBar({ row }: { readonly row: CacheRowView }) {
  const actual = row.judgment.actualRate
  const breakEven = row.judgment.breakEvenRate
  const ceiling = row.judgment.ceilingRate
  const clear = actual !== null && breakEven !== null && actual >= breakEven
  // A rate we declined to judge must not be the loudest mark on its own row: a
  // real quotient over three calls still reads as a finding when it is coloured
  // like one.
  const unjudged = row.judgment.state === "notEnoughData"
  const pct = (value: number): number => Math.max(0, Math.min(100, value * 100))
  const actualPct = pct(actual ?? 0)
  const ceilingPct = ceiling === null ? null : pct(ceiling)
  const headroomPct = ceilingPct === null ? 0 : Math.max(0, ceilingPct - actualPct)

  return (
    <Tooltip
      asChild
      trigger={
        <div className="flex w-full cursor-default flex-row items-center gap-2">
          <div className="relative h-2.5 w-full overflow-hidden rounded-sm bg-muted">
            {unjudged || headroomPct <= 0 ? null : (
              <div
                className="absolute inset-y-0 rounded-sm opacity-25"
                style={{
                  left: `${actualPct}%`,
                  width: `${headroomPct}%`,
                  backgroundColor: CALLS_SERIES_COLOR,
                }}
                aria-hidden="true"
              />
            )}
            <div
              className={cn("h-full rounded-sm", { "bg-muted-foreground/40": unjudged })}
              style={{
                width: `${actualPct}%`,
                ...(unjudged ? {} : { backgroundColor: clear ? CALLS_SERIES_COLOR : TREND_COLOR }),
              }}
            />
            {ceilingPct === null || unjudged ? null : (
              <div
                className="absolute inset-y-0 w-0.5"
                style={{ left: `${ceilingPct}%`, backgroundColor: OTHER_SERIES_COLOR }}
                aria-hidden="true"
              />
            )}
            {breakEven === null || unjudged ? null : (
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
        `Cached input ${actual === null ? DASH : formatPercentage(actual)} · break-even ${breakEven === null ? "unknown" : formatPercentage(breakEven)} · achievable ceiling ${ceiling === null ? "unknown" : formatPercentage(ceiling)}`,
        `${formatCount(row.cacheReadTokens)} read, ${formatCount(row.cacheCreateTokens)} written, ${formatCount(row.inputTokens)} uncached input tokens`,
        formatLifetime(row.lifetimeSeconds) === null
          ? "No cache lifetime is documented for this model, so its ceiling cannot be measured and no verdict rests on one."
          : `Ceiling measured from gaps between this agent's calls against ${formatLifetime(row.lifetimeSeconds)} of documented cache lifetime`,
      ].join("\n")}
    </Tooltip>
  )
}

/** Blank for every state that carries no recommendation, which is what makes those rows sink. */
function SavingsCell({ row }: { readonly row: CacheRowView }) {
  if (row.judgment.modeledSavingsMicrocents === null || !cacheStateIsActionable(row.judgment.state)) {
    return (
      <Text.H5 color="foregroundMuted" noWrap className="tabular-nums">
        {DASH}
      </Text.H5>
    )
  }

  const label = formatPrice(microcentsToUsd(row.judgment.modeledSavingsMicrocents))
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
            {label}
          </Text.H5>
        </span>
      }
    >
      {[
        `Modeled from this window's token counts and the model's registry prices, not from recorded spend — so it will not tie to the breakdown table.`,
        row.judgment.savingsClearsFloor
          ? "Enough to be worth acting on, so it also appears as a recommendation above."
          : "Below the weekly floor a recommendation has to clear, so no card is raised for it.",
      ].join("\n")}
    </Tooltip>
  )
}

function RecommendationCards({ recommendations }: { readonly recommendations: readonly CacheRecommendation[] }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row">
      {recommendations.map((recommendation) => {
        const copy = CACHE_RECOMMENDATION_COPY[recommendation.state]
        return (
          <div
            key={recommendation.state}
            className="flex flex-1 flex-col gap-2 rounded-lg border border-border bg-secondary/40 p-3"
          >
            <div className="flex flex-row flex-wrap items-center justify-between gap-2">
              <Badge variant={RECOMMENDATION_VARIANT[recommendation.state]} size="small">
                {copy.title}
              </Badge>
              <Tooltip
                asChild
                trigger={
                  <span className="inline-flex cursor-default flex-row items-center gap-1">
                    <Text.H5M color="foreground" noWrap className="tabular-nums">
                      {formatPrice(microcentsToUsd(recommendation.savingsMicrocents))}
                    </Text.H5M>
                    <Icon icon={InfoIcon} size="sm" color="foregroundMuted" />
                  </span>
                }
              >
                Modeled saving over this window if these models reached what their own cadence allows. Priced from token
                counts and registry rates, so it will not reconcile against the recorded totals elsewhere on this page.
              </Tooltip>
            </div>
            <Text.H6 color="foregroundMuted">{copy.body}</Text.H6>
            <div className="flex flex-col gap-1">
              {recommendation.rows.map((row) => (
                <div key={`${row.provider}/${row.model}`} className="flex flex-row items-baseline gap-2">
                  <Text.H6 color="foreground" ellipsis noWrap>
                    {row.model || "unknown model"}
                  </Text.H6>
                  <Text.H6 color="foregroundMuted" noWrap className="tabular-nums">
                    {row.judgment.actualRate === null ? DASH : formatPercentage(row.judgment.actualRate)}
                    {row.judgment.ceilingRate === null ? null : ` of ${formatPercentage(row.judgment.ceilingRate)}`}
                  </Text.H6>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CacheTable({
  economics,
  selection,
}: {
  readonly economics: CacheEconomicsRecord
  readonly selection: CacheLifetimeSelection
}) {
  const rows = sortCacheRowsBySavings(economics.rows.map((row) => resolveCacheRow(row, selection))).slice(
    0,
    CACHE_ROWS_SHOWN,
  )
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
                The share of input tokens served from cache, against the rate this model needs to break even and the
                highest rate its call cadence could ever reach. Break-even comes from the model's own registry prices,
                so it differs row to row; the ceiling comes from the gaps between that agent's calls.
              </Tooltip>
            </TableHead>
            <TableHead align="left" className="bg-transparent border-l border-border">
              <Text.H5M color="foregroundMuted" noWrap>
                State
              </Text.H5M>
            </TableHead>
            <TableHead align="right" className="bg-transparent border-l border-border">
              <Tooltip
                asChild
                trigger={
                  <span className="inline-flex cursor-default">
                    <Text.H5M color="foregroundMuted" noWrap>
                      Est. savings
                    </Text.H5M>
                  </span>
                }
              >
                What acting on this row would be worth over the window, modeled from token counts times registry prices.
                Blank where there is nothing to act on, which is why those rows sit at the bottom.
              </Tooltip>
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
            const meta = STATE_META[row.judgment.state]
            return (
              <TableRow key={`${row.provider}/${row.model}`} className="border-background bg-secondary/40">
                <TableCell>
                  <div className="flex flex-row items-center gap-2">
                    <Tooltip
                      asChild
                      trigger={
                        <DotIndicator
                          variant={row.judgment.cachingOn ? "success" : "default"}
                          className={row.judgment.cachingOn ? undefined : "opacity-50"}
                          aria-hidden={false}
                          aria-label={row.judgment.cachingOn ? "Caching on" : "Caching off"}
                        />
                      }
                    >
                      {row.judgment.cachingOn ? "Caching on in this window" : "No cache reads or writes in this window"}
                    </Tooltip>
                    <Text.H5 color="foreground" ellipsis noWrap>
                      {row.model || "unknown model"}
                    </Text.H5>
                    {row.verdictDependsOnLifetime ? (
                      <Tooltip
                        asChild
                        trigger={
                          <span className="inline-flex cursor-default">
                            <Icon icon={ClockIcon} size="sm" color="foregroundMuted" />
                          </span>
                        }
                      >
                        This row's verdict depends on how long the cache is assumed to live — its calls arrive at gaps
                        that fall between the candidate lifetimes. Use the lifetime control to see how it moves.
                      </Tooltip>
                    ) : null}
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
                  <SavingsCell row={row} />
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
          Rates are measured exactly from token counts; savings are modeled from tokens times registry prices and will
          not tie to recorded spend. Break-even is derived per model from its own prices, so a model with no cache-write
          premium breaks even at 0%.
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
 * Whether each model's caching is paying for itself, and what closing the gap would
 * be worth. A comparison table rather than one model at a time: break-even and the
 * achievable ceiling both differ per model, which is exactly the thing paging through
 * them one by one hides.
 */
export function CacheEconomicsPanel({
  economics,
  isLoading,
}: {
  readonly economics: CacheEconomicsRecord | undefined
  readonly isLoading: boolean
}) {
  const [selection, setSelection] = useState<CacheLifetimeSelection>("documented")
  // Cards read documented lifetimes whatever the control says, so an assumption the
  // reader is exploring never comes back to them as our recommendation.
  const recommendations = economics ? groupCacheRecommendations(economics.rows) : []
  const exploring = selection !== "documented"
  const sensitiveRows = economics?.rows.filter((row) => row.verdictDependsOnLifetime).length ?? 0

  return (
    <div className="flex flex-col gap-3">
      {recommendations.length > 0 ? <RecommendationCards recommendations={recommendations} /> : null}
      {/* The row separators are painted in `--background`, so the card must carry it. */}
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
            <Tooltip
              asChild
              trigger={
                <div className="flex cursor-default flex-row items-center gap-1.5">
                  <span
                    className="h-2.5 w-0.5 shrink-0"
                    style={{ backgroundColor: OTHER_SERIES_COLOR }}
                    aria-hidden="true"
                  />
                  <Text.H6 color="foregroundMuted" noWrap>
                    Achievable ceiling
                  </Text.H6>
                </div>
              }
            >
              The highest hit rate this traffic could reach with everything configured perfectly, from the gaps between
              each agent's calls measured against the provider's cache lifetime. Gaps are taken across an agent's whole
              traffic, not within a conversation, because a cache read does not care which conversation wrote the entry.
              It assumes every call to an agent shares the same cacheable prefix, which cannot be verified without
              comparing message content — so it is an upper bound, and real traffic only comes in under it. Models whose
              provider documents no cache lifetime, or only a best-effort one, show no ceiling rather than a guessed
              figure.
            </Tooltip>
          </div>
        </div>
        <div className="flex flex-row flex-wrap items-center justify-between gap-2">
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
              How long a written cache entry is assumed to live, which is what decides whether the gap between two calls
              could have hit it. `Documented` uses each model's own published lifetime and is the only setting whose
              verdicts drive the recommendations above. Pick a value to explore what a different lifetime would mean —
              useful if you have opted into a longer one, since nothing an exporter sends tells us that.
            </Tooltip>
          </div>
          {sensitiveRows > 0 ? (
            <Text.H6 color="foregroundMuted" noWrap>
              {`${formatCount(sensitiveRows)} ${sensitiveRows === 1 ? "row" : "rows"} change verdict with the lifetime`}
            </Text.H6>
          ) : null}
        </div>
        {exploring ? (
          <div className="flex flex-row items-start gap-2 rounded-md border border-warning bg-warning/10 p-2">
            <Icon icon={TriangleAlertIcon} size="sm" color="warningMutedForeground" />
            <Text.H6 color="foreground">
              {`Showing what these models would look like if their cache lived ${lifetimeOptionLabel(selection)}. These are your assumption, not our assessment — the recommendations above stay on each model's documented lifetime.`}
            </Text.H6>
          </div>
        ) : null}
        {isLoading || !economics ? (
          <TableSkeleton rows={5} cols={7} />
        ) : economics.rows.length === 0 ? (
          <div className="flex w-full min-h-[120px] items-center justify-center">
            <Text.H6 color="foregroundMuted">No billable model usage in this time window</Text.H6>
          </div>
        ) : (
          <CacheTable economics={economics} selection={selection} />
        )}
      </div>
    </div>
  )
}
