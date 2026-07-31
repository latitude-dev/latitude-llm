import { SESSION_COST_MIN_SESSIONS, type SessionCostContribution, type SessionCostFactor } from "@domain/spans"
import { cn, Icon, Skeleton, Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { ArrowDownIcon, ArrowUpIcon, InfoIcon, MinusIcon } from "lucide-react"
import type { CostPerSessionRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { rollupCostDisplay } from "../../../../../../domains/spans/cost-display.ts"
import { ChartHeader } from "../../-components/chart-header.tsx"

// Above this share of the denominator, "per session" stops meaning what it says and
// the card has to name the substitution rather than leaving it in a tooltip.
const TRACE_KEYED_DISCLOSURE_SHARE = 0.1

// Below a point the bar is a sliver either way, and the row's own figure already
// says it is nothing. Colouring it would make a rounding artefact look like a cause.
const NEUTRAL_POINTS = 1

interface FactorMeta {
  readonly label: string
  readonly hint: string
  readonly formatValue?: (value: number) => string
}

const ratio = (value: number): string => value.toFixed(2)
const rounded = (value: number): string => formatCount(Math.round(value))

const FACTOR_META: Record<SessionCostFactor, FactorMeta> = {
  turnsPerSession: {
    label: "Turns per session",
    hint: "Traces with a billable call, per session. Longer conversations cost more even when nothing else changes.",
    formatValue: ratio,
  },
  stepsPerTurn: {
    label: "Steps per turn",
    hint: "Billable LLM calls per trace. Retry loops and extra tool round trips land here.",
    formatValue: ratio,
  },
  tokensPerStep: {
    label: "Tokens per step",
    hint: "Tokens per billable call — prompt growth, larger retrieved context, longer outputs.",
    formatValue: rounded,
  },
  modelMix: {
    label: "Model mix",
    hint: "Tokens moving between price lists at unchanged prices. A migration to a cheaper model shows up here.",
  },
  cacheEfficiency: {
    label: "Cache efficiency",
    hint: "The share of the prompt charged at the cache-read rate rather than the full input rate.",
  },
  pricePerToken: {
    label: "Price per token",
    hint: "Whatever within-model rate change is left once model mix and cache efficiency are taken out.",
  },
}

const signedPoints = (points: number): string => `${points > 0 ? "+" : points < 0 ? "−" : ""}${Math.abs(points)} pts`

const signedPercent = (pct: number): string => `${pct > 0 ? "▲" : pct < 0 ? "▼" : ""} ${Math.abs(Math.round(pct))}%`

function ContributionRow({
  row,
  widestPoints,
}: {
  readonly row: SessionCostContribution
  readonly widestPoints: number
}) {
  const meta = FACTOR_META[row.factor]
  const neutral = Math.abs(row.points) < NEUTRAL_POINTS
  const width = widestPoints > 0 ? (Math.abs(row.points) / widestPoints) * 100 : 0
  const icon = neutral ? MinusIcon : row.points > 0 ? ArrowUpIcon : ArrowDownIcon
  const color = neutral ? "foregroundMuted" : row.points > 0 ? "destructive" : "success"
  const values = row.values
  const format = meta.formatValue ?? ratio

  return (
    <Tooltip
      asChild
      trigger={
        <div className="flex w-full cursor-default flex-row items-center gap-3">
          <div className="flex w-36 shrink-0 flex-col">
            <Text.H6 color="foreground" ellipsis noWrap>
              {meta.label}
            </Text.H6>
          </div>
          <div className="relative h-2.5 w-full overflow-hidden rounded-sm bg-muted">
            <div
              className={cn("h-full rounded-sm", {
                "bg-muted-foreground/40": neutral,
                "bg-destructive": !neutral && row.points > 0,
                "bg-success": !neutral && row.points < 0,
              })}
              style={{ width: `${Math.max(0, Math.min(100, width))}%` }}
            />
          </div>
          <div className="flex w-20 shrink-0 flex-row items-center justify-end gap-1">
            <Icon icon={icon} size="sm" color={color} />
            <Text.H6 color={color} noWrap className="tabular-nums">
              {signedPoints(row.points)}
            </Text.H6>
          </div>
        </div>
      }
    >
      {[
        meta.hint,
        values ? `${format(values.previous)} → ${format(values.current)}` : null,
        `Contributed ${signedPoints(row.points)} of the change above.`,
      ]
        .filter((line) => line !== null)
        .join("\n")}
    </Tooltip>
  )
}

function Headline({ record }: { readonly record: CostPerSessionRecord }) {
  // The same rollup vocabulary the KPI row uses, so an average of zero reads as
  // "not known" rather than as free.
  const current = rollupCostDisplay({
    costTotalMicrocents: record.currentCostPerSessionMicrocents,
    unpricedSpanCount: record.unpricedCalls,
    tokensTotal: record.tokens,
  })
  const previous = rollupCostDisplay({
    costTotalMicrocents: record.previousCostPerSessionMicrocents,
    unpricedSpanCount: 0,
    tokensTotal: record.tokens,
  })
  const changePct = record.changePct
  const neutral = changePct === null || Math.abs(Math.round(changePct)) < NEUTRAL_POINTS

  return (
    <div className="flex flex-row flex-wrap items-baseline gap-3">
      <Text.H3 color="foreground" className="tabular-nums">
        {current.label}
      </Text.H3>
      {changePct === null ? null : (
        <Text.H5 color={neutral ? "foregroundMuted" : changePct > 0 ? "destructive" : "success"} noWrap>
          {signedPercent(changePct)}
        </Text.H5>
      )}
      <Text.H6 color="foregroundMuted" noWrap>
        {`from ${previous.label} in the previous period of equal length`}
      </Text.H6>
    </div>
  )
}

function VolumeContext({ record }: { readonly record: CostPerSessionRecord }) {
  const { previousSessions, currentSessions } = record.volume
  const changePct = previousSessions > 0 ? (currentSessions / previousSessions - 1) * 100 : null

  return (
    <Tooltip
      asChild
      trigger={
        <div className="flex w-full cursor-default flex-row items-center gap-3 border-border border-t pt-2">
          <div className="flex w-36 shrink-0 flex-col">
            <Text.H6 color="foregroundMuted" ellipsis noWrap>
              Sessions
            </Text.H6>
          </div>
          <Text.H6 color="foregroundMuted" noWrap className="tabular-nums">
            {`${formatCount(previousSessions)} → ${formatCount(currentSessions)}${
              changePct === null ? "" : ` · ${signedPercent(changePct)}`
            }`}
          </Text.H6>
        </div>
      }
    >
      Not part of the change above: sessions are its denominator, so more of them does not move the average. Shown
      because growth in usage is the one kind of rising spend that is good news.
    </Tooltip>
  )
}

function Disclosures({ record }: { readonly record: CostPerSessionRecord }) {
  const traceKeyed = record.traceKeyedSessionShare
  const lines = [
    traceKeyed !== null && traceKeyed >= TRACE_KEYED_DISCLOSURE_SHARE
      ? `${Math.round(traceKeyed * 100)}% of these sessions are single traces that reported no session id, so this figure is close to average cost per trace.`
      : null,
    "Traffic shifting toward an inherently longer use case raises this with nothing wrong — the rise lands on turns per session. Compare per agent before acting on it.",
  ].filter((line) => line !== null)

  return (
    <div className="flex flex-col gap-1">
      {lines.map((line) => (
        <Text.H6 key={line} color="foregroundMuted">
          {line}
        </Text.H6>
      ))}
    </div>
  )
}

/**
 * Which factor moved average cost per session, in points that sum to the headline.
 *
 * Cost per session is `turns/session x steps/turn x tokens/step x price/token`, and
 * a product decomposes exactly in log space — so each row is a share of the same
 * change rather than an independently-measured correlation. Every figure here is
 * computed server-side; this file only lays the rows out.
 */
export function CostPerSessionPanel({
  record,
  rangeFromIso,
  rangeToIso,
  isAllTime,
  isLoading,
}: {
  readonly record: CostPerSessionRecord | undefined
  readonly rangeFromIso: string
  readonly rangeToIso: string
  readonly isAllTime: boolean
  readonly isLoading: boolean
}) {
  const widestPoints = record ? Math.max(...record.rows.map((row) => Math.abs(row.points)), 1) : 1

  return (
    <div className="flex flex-col rounded-lg bg-secondary">
      <ChartHeader
        title="Cost per session"
        fromIso={rangeFromIso}
        toIso={rangeToIso}
        isAllTime={isAllTime}
        showWindow={isAllTime}
        actions={
          <Tooltip
            asChild
            trigger={
              <span className="inline-flex cursor-default">
                <Icon icon={InfoIcon} size="sm" color="foregroundMuted" />
              </span>
            }
          >
            Total spend divided by sessions, where traffic that reported no session id keys on its trace id instead — so
            it becomes a single-trace session rather than dropping out of the denominator.
          </Tooltip>
        }
      />
      {isLoading || !record ? (
        <div className="flex flex-col gap-3 px-4 py-3">
          <Skeleton className="h-8 w-40" />
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-4 w-full" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 py-3">
          <Headline record={record} />
          {record.status === "notEnoughData" ? (
            <Text.H6 color="foregroundMuted">
              {`Not enough data to compare periods. Both this window and the one before it need at least ${SESSION_COST_MIN_SESSIONS} sessions with recorded spend.`}
            </Text.H6>
          ) : record.status === "flat" ? (
            <Text.H6 color="foregroundMuted">
              Cost per session held flat against the previous period, so no factor moved it.
            </Text.H6>
          ) : (
            <div className="flex flex-col gap-2">
              <Text.H6 color="foregroundMuted">What changed it</Text.H6>
              <div className="flex flex-col gap-2">
                {record.rows.map((row) => (
                  <ContributionRow key={row.factor} row={row} widestPoints={widestPoints} />
                ))}
              </div>
              <VolumeContext record={record} />
            </div>
          )}
          <Disclosures record={record} />
        </div>
      )}
    </div>
  )
}
