import { SegmentBar, type SegmentBarItem, Text, Tooltip } from "@repo/ui"
import { formatCount, formatPrice } from "@repo/utils"
import type React from "react"
import { useMemo } from "react"

export interface UsageData {
  readonly tokensInput: number
  readonly tokensOutput: number
  readonly tokensCacheRead: number
  readonly tokensCacheCreate: number
  readonly tokensReasoning: number
  readonly costInputMicrocents: number
  readonly costOutputMicrocents: number
  readonly costTotalMicrocents: number
  readonly costIsEstimated?: boolean
}

const TOKEN_COLORS = {
  cacheRead: "#d8b4fe",
  cacheCreate: "#a855f7",
  prompt: "#3b82f6",
  reasoning: "#16a34a",
  completion: "#4ade80",
} as const

const COST_COLORS = {
  input: "#3b82f6",
  output: "#4ade80",
} as const

export function hasAnyUsage(data: UsageData): boolean {
  return (
    data.tokensInput > 0 ||
    data.tokensOutput > 0 ||
    data.tokensCacheRead > 0 ||
    data.tokensCacheCreate > 0 ||
    data.tokensReasoning > 0
  )
}

function buildTokenSegments(data: UsageData): SegmentBarItem[] {
  const prompt = data.tokensInput
  const cacheRead = data.tokensCacheRead
  const cacheCreate = data.tokensCacheCreate
  const completion = data.tokensOutput
  const reasoning = data.tokensReasoning

  const segments: SegmentBarItem[] = []
  if (cacheRead > 0) segments.push({ label: "Cache Read", value: cacheRead, color: TOKEN_COLORS.cacheRead })
  if (cacheCreate > 0) segments.push({ label: "Cache Write", value: cacheCreate, color: TOKEN_COLORS.cacheCreate })
  if (prompt > 0) segments.push({ label: "Prompt", value: prompt, color: TOKEN_COLORS.prompt })
  if (reasoning > 0) segments.push({ label: "Reasoning", value: reasoning, color: TOKEN_COLORS.reasoning })
  if (completion > 0) segments.push({ label: "Completion", value: completion, color: TOKEN_COLORS.completion })
  return segments
}

function buildCostSegments(data: UsageData): SegmentBarItem[] {
  const input = data.costInputMicrocents
  const output = data.costOutputMicrocents

  const segments: SegmentBarItem[] = []
  if (input > 0) segments.push({ label: "Input", value: input, color: COST_COLORS.input })
  if (output > 0) segments.push({ label: "Output", value: output, color: COST_COLORS.output })
  return segments
}

function BreakdownRows({
  segments,
  formatValue,
  footer,
}: {
  readonly segments: readonly SegmentBarItem[]
  readonly formatValue: (value: number) => string
  readonly footer?: string
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)

  return (
    <div className="flex flex-col gap-1.5 min-w-[160px]">
      {segments.map((s) => (
        <div key={s.label} className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-row items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            <Text.H6 color="foregroundMuted">{s.label}</Text.H6>
          </div>
          <Text.H6 color="foreground">{formatValue(s.value)}</Text.H6>
        </div>
      ))}

      <hr className="border-t border-border" />

      <div className="flex flex-row items-center justify-between gap-4">
        <Text.H6 color="foregroundMuted">Total</Text.H6>
        <Text.H6 color="foreground">{formatValue(total)}</Text.H6>
      </div>

      {footer && (
        <Text.H6 color="foregroundMuted" italic>
          {footer}
        </Text.H6>
      )}
    </div>
  )
}

function UsageRow({
  label,
  formattedTotal,
  segments,
  formatValue,
  footer,
  badges,
}: {
  readonly label: string
  readonly formattedTotal: string
  readonly segments: readonly SegmentBarItem[]
  readonly formatValue: (value: number) => string
  readonly footer?: string
  readonly badges?: React.ReactNode
}) {
  return (
    <div className="flex min-h-8 flex-row items-center gap-3">
      <div className="flex min-w-12 self-center">
        <Text.H6 color="foregroundMuted" noWrap>
          {label}
        </Text.H6>
      </div>

      <Tooltip
        trigger={
          <div className="flex min-w-0 w-full max-w-48 self-center items-center">
            <SegmentBar segments={segments} />
          </div>
        }
        asChild
      >
        <BreakdownRows segments={segments} formatValue={formatValue} {...(footer ? { footer } : {})} />
      </Tooltip>

      <div className="flex items-center gap-2 self-center">
        <Text.H5 color="foreground" noWrap>
          {formattedTotal}
        </Text.H5>
        {badges}
      </div>
    </div>
  )
}

function microcentsToDollars(microcents: number): number {
  return microcents / 100_000_000
}

export function UsageSummary({
  data,
  costBadges,
}: {
  readonly data: UsageData
  readonly costBadges?: React.ReactNode
}) {
  const tokenSegments = useMemo(() => buildTokenSegments(data), [data])
  const costSegments = useMemo(() => buildCostSegments(data), [data])

  const totalTokens =
    data.tokensInput + data.tokensCacheRead + data.tokensCacheCreate + data.tokensOutput + data.tokensReasoning
  const hasCost = data.costTotalMicrocents > 0
  const hasTokens = hasAnyUsage(data)

  if (!hasTokens && !hasCost) return null

  return (
    <div className="flex flex-col gap-2">
      {hasTokens && (
        <UsageRow
          label="Tokens"
          formattedTotal={formatCount(totalTokens)}
          segments={tokenSegments}
          formatValue={(v) => formatCount(v)}
        />
      )}

      {hasCost && (
        <UsageRow
          label="Cost"
          formattedTotal={`${formatPrice(microcentsToDollars(data.costTotalMicrocents))}${data.costIsEstimated ? "*" : ""}`}
          segments={costSegments}
          formatValue={(v) => formatPrice(microcentsToDollars(v))}
          {...(data.costIsEstimated ? { footer: "Cost is estimated" } : {})}
          badges={costBadges}
        />
      )}
    </div>
  )
}
