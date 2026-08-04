import { SESSION_COST_MIN_SESSIONS, type SessionCostContribution, type SessionCostFactor } from "@domain/spans"
import { Icon, Skeleton, Text, Tooltip } from "@repo/ui"
import { formatCount, formatPercentage } from "@repo/utils"
import { InfoIcon } from "lucide-react"
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
    hint: "The share of tokens each model took, with every price list's own prices held fixed — moving traffic to a dearer model raises what an average token costs without anything being repriced. The model named is where the tokens went. A share can move because someone changed a model or because a busier agent happens to use a dearer one, and this row cannot tell those apart.",
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

const signedPercent = (pct: number): string => `${pct > 0 ? "▲" : pct < 0 ? "▼" : ""} ${Math.abs(Math.round(pct))}%`

const directionColor = (multiplier: number): "destructive" | "success" | "foregroundMuted" => {
  if (multiplier > 1) return "destructive"
  if (multiplier < 1) return "success"
  return "foregroundMuted"
}

const rowLabel = (row: SessionCostContribution): string =>
  row.factor === null
    ? `${row.foldedFactors} ${row.foldedFactors === 1 ? "factor" : "factors"} unchanged`
    : FACTOR_META[row.factor].label

/** The concrete move behind a row: its own before/after, or the share shift driving a mix row. */
function rowDetail(row: SessionCostContribution): string | null {
  if (row.factor === null) return null
  if (row.values) {
    const format = FACTOR_META[row.factor].formatValue ?? ratio
    return `${format(row.values.previous)} → ${format(row.values.current)}`
  }
  if (!row.shareShift) return null
  const { label, previousShare, currentShare } = row.shareShift
  return `${label} ${formatPercentage(previousShare)} → ${formatPercentage(currentShare)}`
}

function ContributionRow({ row }: { readonly row: SessionCostContribution }) {
  const detail = rowDetail(row)
  const muted = row.factor === null

  return (
    <Tooltip
      asChild
      trigger={
        // The multiplier sits against its own label rather than across the card: at
        // full width the eye had to travel the whole panel to pair the two up.
        <div className="flex w-full cursor-default flex-col gap-0.5">
          <div className="flex flex-row items-baseline justify-between gap-2">
            <Text.H6 color={muted ? "foregroundMuted" : "foreground"} ellipsis noWrap>
              {rowLabel(row)}
            </Text.H6>
            <Text.H6
              color={muted ? "foregroundMuted" : directionColor(row.multiplier)}
              noWrap
              className="shrink-0 tabular-nums"
            >
              {formatMultiplier(row.multiplier)}
            </Text.H6>
          </div>
          {detail ? (
            <Text.H6 color="foregroundMuted" ellipsis noWrap className="tabular-nums">
              {detail}
            </Text.H6>
          ) : null}
        </div>
      }
    >
      {row.factor === null
        ? "Factors that did not move. Folded into one row so the visible ones still multiply to the total."
        : FACTOR_META[row.factor].hint}
    </Tooltip>
  )
}

/** A headline measure: the number, its change, and the shape it took getting there. */
function HeadlineBlock({
  label,
  value,
  changePct,
  detail,
  points,
  hint,
}: {
  readonly label: string
  readonly value: string
  readonly changePct: number | null
  readonly detail?: string
  readonly points: readonly (number | null)[]
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
      <SessionSparkline points={points} label={`${label} over both periods`} />
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
            <HeadlineBlock
              label="Sessions"
              value={formatCount(record.volume.currentSessions)}
              changePct={sessionsChangePct}
              {...(record.volume.previousSessions > 0
                ? { detail: `from ${formatCount(record.volume.previousSessions)}` }
                : {})}
              points={record.buckets.map((bucket) => bucket.sessions)}
              hint="Sessions with billable spend. Traffic that reported no session id keys on its trace id instead, so it counts as a single-trace session rather than dropping out of the denominator. More sessions does not move what each one costs — that is the figure beside this."
            />
            <HeadlineBlock
              label="Cost per session"
              value={cost.label}
              changePct={record.changePct}
              {...(record.totalMultiplier === null ? {} : { detail: formatMultiplier(record.totalMultiplier) })}
              points={record.buckets.map((bucket) =>
                bucket.costPerSessionMicrocents === null ? null : microcentsToUsd(bucket.costPerSessionMicrocents),
              )}
              hint="Spend divided by sessions, for this window against the equal-length window before it. The factors beside it are its multiplicative parts, so their multipliers multiply to this change."
            />
            {/* Third column, so each row's multiplier reads next to its own label. */}
            <div className="flex min-w-0 flex-1 flex-col gap-2 lg:border-border lg:border-l lg:pl-6">
              {record.status === "notEnoughData" ? (
                <Text.H6 color="foregroundMuted">{notEnoughDataReason(record)}</Text.H6>
              ) : record.status === "flat" ? (
                <Text.H6 color="foregroundMuted">
                  Cost per session held flat against the previous period, so no factor moved it.
                </Text.H6>
              ) : (
                <>
                  <Text.H6 color="foregroundMuted">What changed it</Text.H6>
                  <div className="flex flex-col gap-1.5">
                    {record.rows.map((row) => (
                      <ContributionRow key={row.factor ?? "unchanged"} row={row} />
                    ))}
                    <div className="flex flex-row items-baseline justify-between gap-2 border-border border-t pt-1.5">
                      <Text.H6 color="foreground" ellipsis noWrap>
                        Cost per session
                      </Text.H6>
                      {/* `rowsMultiplyTo`, not the exact total: this is what the rows above multiply to. */}
                      <Text.H6
                        color={
                          record.rowsMultiplyTo === null ? "foregroundMuted" : directionColor(record.rowsMultiplyTo)
                        }
                        noWrap
                        className="shrink-0 tabular-nums"
                      >
                        {record.rowsMultiplyTo === null ? "" : formatMultiplier(record.rowsMultiplyTo)}
                      </Text.H6>
                    </div>
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
