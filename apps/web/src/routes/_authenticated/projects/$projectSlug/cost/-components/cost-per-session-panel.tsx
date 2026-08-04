import {
  SESSION_COST_MIN_SESSIONS,
  SESSION_COST_QUIET_BAND,
  type SessionCostContribution,
  type SessionCostFactor,
} from "@domain/spans"
import { Icon, Skeleton, Text, Tooltip } from "@repo/ui"
import { formatCount, formatPercentage } from "@repo/utils"
import { ArrowDownIcon, ArrowUpIcon, InfoIcon, MinusIcon } from "lucide-react"
import type { CostPerSessionRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { rollupCostDisplay } from "../../../../../../domains/spans/cost-display.ts"
import { ChartHeader } from "../../-components/chart-header.tsx"
import { microcentsToUsd } from "./cost-formatters.ts"
import { SessionSparkline } from "./session-sparkline.tsx"

// Above this share of the denominator, "per session" stops meaning what it says and
// the card has to name the substitution rather than leaving it in a tooltip.
const TRACE_KEYED_DISCLOSURE_SHARE = 0.1

// Below a whole point the headline change is noise, and colouring it would make a
// rounding artefact look like a movement.
const NEUTRAL_PERCENT = 1

interface FactorMeta {
  readonly label: string
  readonly hint: string
  readonly formatValue?: (value: number) => string
}

const ratio = (value: number): string => value.toFixed(2)
const whole = (value: number): string => formatCount(Math.round(value))

const FACTOR_META: Record<SessionCostFactor, FactorMeta> = {
  tracesPerSession: {
    label: "Traces per session",
    hint: "Traces with a billable call, per session. One trace is one request to an agent, not one conversational turn.",
    formatValue: ratio,
  },
  callsPerTrace: {
    label: "LLM calls per trace",
    hint: "Billable model calls a single trace spent to answer. Retry loops and extra tool round trips land here.",
    formatValue: ratio,
  },
  tokensPerCall: {
    label: "Tokens per call",
    hint: "Prompt plus output tokens per call — prompt growth, larger retrieved context, longer answers.",
    formatValue: whole,
  },
  modelMix: {
    label: "Which models",
    hint: "The share of tokens each model took, with every price list's own prices held fixed — moving traffic to a dearer model raises what an average token costs without anything being repriced. The model named is where most of the effect went; `+N more` means other models gained share too, so the shift is broader than one name. A share can move because someone changed a model or because a busier agent happens to use a dearer one, and this row cannot tell those apart.",
  },
  tokenMix: {
    label: "Prompt vs output split",
    hint: "How the tokens divided between the cheap prompt side and the dearer output side — output runs 10-25x prompt. Growing the prompt while the answer stays the same length makes the average token cheaper with no price changing, which is why it is not one of the price rows.",
  },
  promptRate: {
    label: "Prompt price",
    hint: "What a prompt token actually costs, holding the model and the prompt/output split fixed. Only a real price change lands here.",
  },
  outputRate: {
    label: "Output price",
    hint: "What an output token actually costs, holding the model and the prompt/output split fixed. Only a real price change lands here.",
  },
}

const formatMultiplier = (multiplier: number): string => `×${multiplier.toFixed(2)}`

// The arrow reads off the rounded figure, not the raw one: at +0.4 the two disagree
// and the caret points up beside a `0%`.
const signedPercent = (pct: number): string => {
  const rounded = Math.round(pct)
  return `${rounded > 0 ? "▲" : rounded < 0 ? "▼" : ""} ${Math.abs(rounded)}%`
}

const isStill = (multiplier: number): boolean => Math.abs(multiplier - 1) < SESSION_COST_QUIET_BAND

const directionColor = (multiplier: number): "destructive" | "success" | "foregroundMuted" => {
  if (isStill(multiplier)) return "foregroundMuted"
  return multiplier > 1 ? "destructive" : "success"
}

const directionArrow = (multiplier: number) =>
  isStill(multiplier) ? MinusIcon : multiplier > 1 ? ArrowUpIcon : ArrowDownIcon

/**
 * The evidence under a tile's multiplier, in that factor's own units.
 *
 * Null for the two rate factors, and deliberately: the number a reader would expect
 * there is the blended price per side, and that moves with model mix, so a tile
 * could show a doubled prompt price beside a x1.00 saying nothing repriced. There
 * is no honest single figure for those two, only the multiplier.
 */
function rowDetail(row: SessionCostContribution): string | null {
  if (row.values) {
    const format = FACTOR_META[row.factor].formatValue ?? ratio
    return `${format(row.values.previous)} → ${format(row.values.current)}`
  }
  if (!row.shareShift) return null
  const { label, previousShare, currentShare, alsoMoved } = row.shareShift
  const move = `${label} ${formatPercentage(previousShare)} → ${formatPercentage(currentShare)}`
  return alsoMoved > 0 ? `${move} +${alsoMoved} more` : move
}

/**
 * One factor. The multiplier leads and always means the same thing — effect on cost
 * per session — with the factor's own before and after underneath as evidence.
 *
 * A still factor keeps its tile rather than disappearing: which seven things the
 * decomposition accounts for is part of what the card says, and it cannot be read
 * off a list whose shape changes every period.
 */
function FactorTile({ row }: { readonly row: SessionCostContribution }) {
  const detail = rowDetail(row)
  const still = isStill(row.multiplier)
  const color = directionColor(row.multiplier)

  return (
    <Tooltip
      asChild
      trigger={
        <div className="flex min-w-0 cursor-default flex-col gap-0.5 rounded-md bg-background/40 p-2">
          <Text.H6 color="foregroundMuted" ellipsis noWrap>
            {FACTOR_META[row.factor].label}
          </Text.H6>
          <div className="flex flex-row items-center gap-1">
            <Icon icon={directionArrow(row.multiplier)} size="sm" color={color} />
            <Text.H5M color={color} noWrap className="tabular-nums">
              {formatMultiplier(row.multiplier)}
            </Text.H5M>
          </div>
          <Text.H6 color="foregroundMuted" ellipsis noWrap className="tabular-nums">
            {still && !detail ? "unchanged" : (detail ?? "")}
          </Text.H6>
        </div>
      }
    >
      {FACTOR_META[row.factor].hint}
    </Tooltip>
  )
}

/**
 * Heading for the grid, spanning the cells the seven factors leave over.
 *
 * Carries no figure of its own. The total belongs to the Cost per session block, and
 * printing it twice invited the two copies to disagree in their last digit — which is
 * unavoidable once each tile is rounded for display.
 */
function TotalTile() {
  return (
    <div className="col-span-2 flex min-w-0 flex-col justify-center gap-1 p-2">
      <Text.H4M color="foreground">What changed</Text.H4M>
      <Text.H6 color="foregroundMuted">
        Cost per session is these seven multiplied together, so each one is a multiplier on it.
      </Text.H6>
    </div>
  )
}

/** A headline measure: the number, its change, and the shape it took getting there. */
function HeadlineBlock({
  label,
  value,
  changePct,
  detail,
  points,
  boundaryIndex,
  hint,
}: {
  readonly label: string
  readonly value: string
  readonly changePct: number | null
  readonly detail?: string
  readonly points: readonly (number | null)[]
  readonly boundaryIndex: number | undefined
  readonly hint: string
}) {
  const neutral = changePct === null || Math.abs(Math.round(changePct)) < NEUTRAL_PERCENT

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex flex-row items-center gap-1">
        <Text.H6 color="foregroundMuted">{label}</Text.H6>
        <Tooltip
          asChild
          trigger={
            <span className="inline-flex cursor-default">
              <Icon icon={InfoIcon} size="sm" color="foregroundMuted" />
            </span>
          }
        >
          {hint}
        </Tooltip>
      </div>
      <Text.H3 color="foreground" className="tabular-nums">
        {value}
      </Text.H3>
      <div className="flex flex-row items-baseline gap-2">
        {changePct === null ? (
          <Text.H6 color="foregroundMuted" noWrap>
            no comparison
          </Text.H6>
        ) : (
          <Text.H6
            color={neutral ? "foregroundMuted" : changePct > 0 ? "destructive" : "success"}
            noWrap
            className="tabular-nums"
          >
            {neutral ? "flat" : signedPercent(changePct)}
          </Text.H6>
        )}
        {detail ? (
          <Text.H6 color="foregroundMuted" ellipsis noWrap>
            {detail}
          </Text.H6>
        ) : null}
      </div>
      <SessionSparkline points={points} boundaryIndex={boundaryIndex} label={`${label} over both periods`} />
    </div>
  )
}

/**
 * Names the side that is short and by how much, rather than restating the rule.
 *
 * An empty comparison window is a different answer from a thin one and gets its own
 * sentence: no traffic precedes the window at all, so widening the range cannot
 * help and only more history will.
 */
function notEnoughDataReason(record: CostPerSessionRecord): string {
  const { previousSessions, currentSessions } = record.volume
  if (previousSessions === 0 && currentSessions > 0) {
    return "No sessions recorded before this window, so there is nothing to compare it against yet."
  }

  const short = [
    currentSessions < SESSION_COST_MIN_SESSIONS ? `${formatCount(currentSessions)} in this window` : null,
    previousSessions < SESSION_COST_MIN_SESSIONS ? `${formatCount(previousSessions)} in the one before it` : null,
  ].filter((part) => part !== null)

  if (short.length === 0) {
    return "Not enough data to compare periods: one of the two windows recorded no billable spend."
  }
  return `Not enough data to compare periods: ${short.join(" and ")}, against the ${SESSION_COST_MIN_SESSIONS} sessions a comparison needs on both sides.`
}

/**
 * What moved average cost per session, as a multiplier per factor.
 *
 * Cost per session is `traces/session x calls/trace x tokens/call x cost/token`, so
 * each row's multiplier is that factor's own before/after ratio and the rows
 * multiply to the headline. Sessions sits beside it rather than among the rows
 * because it is the denominator: more of them does not move the cost of each one.
 *
 * Every figure is computed server-side; this file lays the rows out.
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
  const cost = record
    ? rollupCostDisplay({
        costTotalMicrocents: record.currentCostPerSessionMicrocents,
        unpricedSpanCount: record.unpricedCalls,
        tokensTotal: record.tokens,
      })
    : null
  const sessionsChangePct =
    record && record.volume.previousSessions > 0
      ? (record.volume.currentSessions / record.volume.previousSessions - 1) * 100
      : null
  const traceKeyed = record?.traceKeyedSessionShare ?? null
  // Where the comparison window ends and the shown one begins, so the sparklines can
  // mark it. Both blocks plot the same buckets, so one index serves both.
  const currentWindowStart = record?.buckets.findIndex(
    (bucket) => Date.parse(bucket.bucketStartIso) >= Date.parse(rangeFromIso),
  )
  const boundaryIndex = currentWindowStart !== undefined && currentWindowStart > 0 ? currentWindowStart : undefined

  return (
    <div className="flex flex-col rounded-lg bg-secondary">
      <ChartHeader title="Cost per session" fromIso={rangeFromIso} toIso={rangeToIso} isAllTime={isAllTime} />
      {isLoading || !record || !cost ? (
        <div className="flex flex-col gap-6 px-4 py-3 lg:flex-row">
          {[0, 1, 2].map((column) => (
            <Skeleton key={column} className="h-24 flex-1" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-4 py-3">
          <div className="flex flex-col gap-6 lg:flex-row">
            {/* The two measures on the left, the factors of the second one on the right. */}
            <div className="flex min-w-0 flex-col gap-4 lg:w-1/3 lg:shrink-0">
              <HeadlineBlock
                label="Sessions"
                value={formatCount(record.volume.currentSessions)}
                changePct={sessionsChangePct}
                {...(record.volume.previousSessions > 0
                  ? { detail: `from ${formatCount(record.volume.previousSessions)}` }
                  : {})}
                points={record.buckets.map((bucket) => bucket.sessions)}
                boundaryIndex={boundaryIndex}
                hint="Sessions with billable spend. Traffic that reported no session id keys on its trace id instead, so it counts as a single-trace session rather than dropping out of the denominator. More sessions does not move what each one costs — that is the figure below."
              />
              <HeadlineBlock
                label="Cost per session"
                value={cost.label}
                changePct={record.changePct}
                {...(record.totalMultiplier === null ? {} : { detail: formatMultiplier(record.totalMultiplier) })}
                points={record.buckets.map((bucket) =>
                  bucket.costPerSessionMicrocents === null ? null : microcentsToUsd(bucket.costPerSessionMicrocents),
                )}
                boundaryIndex={boundaryIndex}
                hint="Spend divided by sessions, for this window against the equal-length window before it. The factors beside it are its multiplicative parts, so their multipliers multiply to this change."
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2 lg:border-border lg:border-l lg:pl-6">
              {record.status === "notEnoughData" ? (
                <Text.H6 color="foregroundMuted">{notEnoughDataReason(record)}</Text.H6>
              ) : record.status === "flat" ? (
                <Text.H6 color="foregroundMuted">
                  Cost per session held flat against the previous period, so no factor moved it.
                </Text.H6>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <TotalTile />
                    {record.rows.map((row) => (
                      <FactorTile key={row.factor} row={row} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {traceKeyed !== null && traceKeyed >= TRACE_KEYED_DISCLOSURE_SHARE ? (
            <Text.H6 color="foregroundMuted">
              {`${Math.round(traceKeyed * 100)}% of these sessions are single traces that reported no session id, so this figure is close to average cost per trace.`}
            </Text.H6>
          ) : null}
        </div>
      )}
    </div>
  )
}
