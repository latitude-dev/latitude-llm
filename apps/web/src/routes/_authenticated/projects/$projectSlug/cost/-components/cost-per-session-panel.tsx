import {
  SESSION_COST_MIN_SESSIONS,
  SESSION_COST_QUIET_BAND,
  type SessionCostContribution,
  type SessionCostFactor,
} from "@domain/spans"
import { Badge, type BadgeProps, Skeleton, Text, Tooltip } from "@repo/ui"
import { formatChartWindowCaption, formatCount, formatPercentage, formatPrice } from "@repo/utils"
import { ArrowDownIcon, ArrowUpIcon, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import type { CostPerSessionRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { rollupCostDisplay } from "../../../../../../domains/spans/cost-display.ts"
import { microcentsToUsd } from "./cost-formatters.ts"
import { SessionSparkline } from "./session-sparkline.tsx"
import { SplitValue } from "./split-value.tsx"

// Above this share of the denominator, "per session" stops meaning what it says and
// the card has to name the substitution rather than leaving it in a tooltip.
const TRACE_KEYED_DISCLOSURE_SHARE = 0.1

// Below a whole point the headline change is noise, and colouring it would make a
// rounding artefact look like a movement.
const NEUTRAL_PERCENT = 1

interface FactorMeta {
  readonly label: string
  readonly hint: string
  /** Formats the factor's standing value, which is in that factor's own unit. */
  readonly format: (value: number) => string
  /**
   * What the value covers, for a factor whose row carries no subject of its own. The
   * two rate tiles need it: their figure is blended over every model while their
   * marker holds the mix fixed, and a tile reading `Prompt price $0.72/1M` invites
   * "whose price?" unless it answers on its face.
   */
  readonly covers?: string
}

const ratio = (value: number): string => value.toFixed(2)
const whole = (value: number): string => formatCount(Math.round(value))
const share = (value: number): string => formatPercentage(value)

// Microcents per token reads as nothing; per million tokens is how price lists are quoted.
const MICROCENTS_PER_USD = 100_000_000
const perMillionTokens = (microcentsPerToken: number): string =>
  `${formatPrice((microcentsPerToken * 1_000_000) / MICROCENTS_PER_USD)} /1M`

const FACTOR_META: Record<SessionCostFactor, FactorMeta> = {
  tracesPerSession: {
    label: "Traces per session",
    hint: "Traces with a billable call, per session. One trace is one request to an agent, not one conversational turn.",
    format: ratio,
  },
  callsPerTrace: {
    label: "LLM calls per trace",
    hint: "Billable model calls a single trace spent to answer. Retry loops and extra tool round trips land here.",
    format: ratio,
  },
  tokensPerCall: {
    label: "Tokens per call",
    hint: "Prompt plus output tokens per call — prompt growth, larger retrieved context, longer answers.",
    format: whole,
  },
  modelMix: {
    label: "Which models",
    format: share,
    hint: "The share of tokens each model took, with every price list's own prices held fixed — moving traffic to a dearer model raises what an average token costs without anything being repriced. The model named is where most of the effect went; `+N more` means other models gained share too, so the shift is broader than one name. A share can move because someone changed a model or because a busier agent happens to use a dearer one, and this row cannot tell those apart.",
  },
  tokenMix: {
    label: "Prompt vs output split",
    format: share,
    hint: "How the tokens divided between the cheap prompt side and the dearer output side — output runs 10-25x prompt. Growing the prompt while the answer stays the same length makes the average token cheaper with no price changing, which is why it is not one of the price rows.",
  },
  promptRate: {
    label: "Prompt price",
    format: perMillionTokens,
    covers: "averaged over all models",
    hint: "What you actually paid per prompt token, averaged over every model — so it matches no single price list. The marker beside it holds the model mix fixed, and moves only when a price list itself changes: routing tokens to a dearer model shows up under Which models, not here.",
  },
  outputRate: {
    label: "Output price",
    format: perMillionTokens,
    covers: "averaged over all models",
    hint: "What you actually paid per output token, averaged over every model — so it matches no single price list. The marker beside it holds the model mix fixed, and moves only when a price list itself changes: routing tokens to a dearer model shows up under Which models, not here.",
  },
}

/**
 * The six factors shown in the "Contributing changes" grid, in reading order. `modelMix`
 * ("Which models") is deliberately absent from this card.
 */
const FACTOR_GRID_ORDER: readonly SessionCostFactor[] = [
  "tokensPerCall",
  "tokenMix",
  "tracesPerSession",
  "promptRate",
  "callsPerTrace",
  "outputRate",
]

const formatMultiplier = (multiplier: number): string => `×${multiplier.toFixed(2)}`

const isStill = (multiplier: number): boolean => Math.abs(multiplier - 1) < SESSION_COST_QUIET_BAND

const directionColor = (multiplier: number): "destructive" | "success" | "foregroundMuted" => {
  if (isStill(multiplier)) return "foregroundMuted"
  return multiplier > 1 ? "destructive" : "success"
}

/** Null on a still factor — held-flat gets plain muted text, not a dash icon. */
const directionArrow = (multiplier: number): LucideIcon | null => {
  if (isStill(multiplier)) return null
  return multiplier > 1 ? ArrowUpIcon : ArrowDownIcon
}

const TREND_BADGE_VARIANT: Record<"destructive" | "success" | "foregroundMuted", NonNullable<BadgeProps["variant"]>> = {
  destructive: "destructiveMuted",
  success: "successMuted",
  foregroundMuted: "muted",
}

/** The arrow-plus-figure trend indicator, as a badge — shared by the factor grid and the headline blocks. */
function TrendBadge({
  color,
  icon,
  children,
}: {
  readonly color: "destructive" | "success" | "foregroundMuted"
  readonly icon: LucideIcon | null
  readonly children: ReactNode
}) {
  return (
    <Badge
      variant={TREND_BADGE_VARIANT[color]}
      className="tabular-nums"
      {...(icon ? { iconProps: { icon, placement: "start" as const } } : {})}
    >
      {children}
    </Badge>
  )
}

/**
 * What the standing value is a share of, where the number alone would be ambiguous.
 */
function rowSubject(row: SessionCostContribution): string | null {
  if (!row.subject) return FACTOR_META[row.factor].covers ?? null
  return row.alsoMoved > 0 ? `${row.subject} +${row.alsoMoved} more` : row.subject
}

/**
 * One factor: where it stands now, and which way it pushed the cost of a session.
 *
 * The standing value leads; the arrow and its figure say the direction and size of the
 * push. Never a before-and-after pair — for the two rate factors the pair would be a
 * blended per-side price, which moves with model mix, so it would contradict a marker
 * that holds the mix fixed.
 *
 * A still factor keeps its tile rather than disappearing: which six things this grid
 * accounts for is part of what the card says, and it cannot be read off a list whose
 * shape changes every period. Its subject (which model, what the rate covers) lives in
 * the tooltip rather than a third line, matched to the design's plain two-line tile.
 */
function FactorTile({ row }: { readonly row: SessionCostContribution }) {
  const meta = FACTOR_META[row.factor]
  const color = directionColor(row.multiplier)
  const icon = directionArrow(row.multiplier)
  const subject = rowSubject(row)

  return (
    <Tooltip
      asChild
      trigger={
        <div className="flex min-w-0 flex-1 cursor-default flex-col gap-1">
          <Text.H6M color="foregroundMuted" ellipsis noWrap>
            {meta.label}
          </Text.H6M>
          <Text.H3M color="foreground" noWrap className="tabular-nums">
            <SplitValue formatted={meta.format(row.current)} />
          </Text.H3M>
          <TrendBadge color={color} icon={icon}>
            {formatMultiplier(row.multiplier)}
          </TrendBadge>
        </div>
      }
    >
      {subject ? `${subject}. ${meta.hint}` : meta.hint}
    </Tooltip>
  )
}

/**
 * A headline measure: the number, which way it moved, and the shape it took getting there.
 * No icon and plain "flat" text when the change doesn't clear the neutral band, matching
 * how a still factor tile reads in the grid beside it.
 */
function HeadlineBlock({
  label,
  value,
  changePct,
  points,
  boundaryIndex,
  hint,
}: {
  readonly label: string
  readonly value: string
  readonly changePct: number | null
  readonly points: readonly (number | null)[]
  readonly boundaryIndex: number | undefined
  readonly hint: string
}) {
  const neutral = changePct === null || Math.abs(Math.round(changePct)) < NEUTRAL_PERCENT
  const color = neutral ? "foregroundMuted" : changePct !== null && changePct > 0 ? "destructive" : "success"
  const icon = neutral || changePct === null ? null : changePct > 0 ? ArrowUpIcon : ArrowDownIcon

  return (
    <Tooltip
      asChild
      trigger={
        <div className="flex min-w-0 flex-1 cursor-default flex-col justify-between gap-2">
          <div className="flex flex-col gap-1">
            <Text.H6M color="foregroundMuted" noWrap>
              {label}
            </Text.H6M>
            <Text.H3M color="foreground" noWrap className="tabular-nums">
              <SplitValue formatted={value} />
            </Text.H3M>
            <div className="flex flex-row items-center gap-1">
              {changePct === null ? (
                <Badge variant="muted">no comparison</Badge>
              ) : (
                <TrendBadge color={color} icon={icon}>
                  {neutral ? "flat" : formatPercentage(Math.abs(changePct) / 100)}
                </TrendBadge>
              )}
            </div>
          </div>
          <div className="flex h-[47px] w-full items-end border-border border-b">
            <SessionSparkline points={points} boundaryIndex={boundaryIndex} label={`${label} over both periods`} />
          </div>
        </div>
      }
    >
      {hint}
    </Tooltip>
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

/** "Cost per session": sessions and the headline figure, each with its own shape over time. */
function SessionHeadlineCard({
  record,
  cost,
  sessionsChangePct,
  boundaryIndex,
}: {
  readonly record: CostPerSessionRecord
  readonly cost: { readonly label: string; readonly note?: string }
  readonly sessionsChangePct: number | null
  readonly boundaryIndex: number | undefined
}) {
  return (
    <div className="flex flex-1 flex-col rounded-lg bg-secondary">
      <div className="p-4">
        <Text.H6M color="foregroundMuted">Cost per session</Text.H6M>
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4">
        <div className="flex flex-1 flex-row gap-6">
          <HeadlineBlock
            label="Sessions"
            value={formatCount(record.volume.currentSessions)}
            changePct={sessionsChangePct}
            points={record.buckets.map((bucket) => bucket.sessions)}
            boundaryIndex={boundaryIndex}
            hint="Sessions with billable spend. Traffic that reported no session id keys on its trace id instead, so it counts as a single-trace session rather than dropping out of the denominator. More sessions does not move what each one costs — that is the figure beside it."
          />
          <HeadlineBlock
            label="Cost per session"
            value={cost.label}
            changePct={record.changePct}
            points={record.buckets.map((bucket) =>
              bucket.costPerSessionMicrocents === null ? null : microcentsToUsd(bucket.costPerSessionMicrocents),
            )}
            boundaryIndex={boundaryIndex}
            hint={`Spend divided by sessions, against the equal-length window before it (${formatChartWindowCaption(record.comparedFromIso, record.comparedToIso)}). Each factor in "Contributing changes" shows where it stands now and which way it pushed this figure.`}
          />
        </div>
      </div>
    </div>
  )
}

/** "Contributing changes": the six factors, each a tile in a fixed 3x2 reading order. */
function ContributingChangesCard({ record }: { readonly record: CostPerSessionRecord }) {
  const rowByFactor = new Map(record.rows.map((row) => [row.factor, row]))
  const rows = FACTOR_GRID_ORDER.map((factor) => rowByFactor.get(factor)).filter(
    (row): row is SessionCostContribution => row !== undefined,
  )

  return (
    <div className="flex flex-1 flex-col rounded-lg bg-secondary">
      <div className="flex flex-1 flex-col gap-6 p-4">
        {record.status === "notEnoughData" ? (
          <Text.H6 color="foregroundMuted">{notEnoughDataReason(record)}</Text.H6>
        ) : record.status === "flat" ? (
          <Text.H6 color="foregroundMuted">
            Cost per session held flat against the previous period, so no factor moved it.
          </Text.H6>
        ) : (
          <>
            <div className="flex flex-row gap-3">
              {rows.slice(0, 3).map((row) => (
                <FactorTile key={row.factor} row={row} />
              ))}
            </div>
            <div className="flex flex-row gap-3">
              {rows.slice(3, 6).map((row) => (
                <FactorTile key={row.factor} row={row} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
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
  isLoading,
}: {
  readonly record: CostPerSessionRecord | undefined
  readonly rangeFromIso: string
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
    <div className="flex flex-col gap-2">
      {isLoading || !record || !cost ? (
        <div className="flex flex-col gap-2 lg:flex-row">
          {[0, 1].map((column) => (
            <Skeleton key={column} className="h-40 flex-1 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 lg:flex-row">
            <SessionHeadlineCard
              record={record}
              cost={cost}
              sessionsChangePct={sessionsChangePct}
              boundaryIndex={boundaryIndex}
            />
            <ContributingChangesCard record={record} />
          </div>
          {traceKeyed !== null && traceKeyed >= TRACE_KEYED_DISCLOSURE_SHARE ? (
            <Text.H6 color="foregroundMuted">
              {`${Math.round(traceKeyed * 100)}% of these sessions are single traces that reported no session id, so this figure is close to average cost per trace.`}
            </Text.H6>
          ) : null}
        </>
      )}
    </div>
  )
}
