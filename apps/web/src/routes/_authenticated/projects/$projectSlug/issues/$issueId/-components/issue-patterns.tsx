import type { DimensionPattern } from "@domain/signals"
import type { SignalDimension } from "@domain/scores"
import { ProviderIcon, Skeleton, Status, TagBadge, Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { WrenchIcon } from "lucide-react"
import { useSignalDimensions } from "../../../../../../../domains/issues/issues.collection.ts"

const DIMENSIONS: { readonly id: SignalDimension; readonly noun: string }[] = [
  { id: "model", noun: "model" },
  { id: "provider", noun: "provider" },
  { id: "tool", noun: "tool" },
  { id: "tag", noun: "tag" },
  { id: "finishReason", noun: "finish reason" },
]

/** Integer percentage, with `<1%` for a tiny-but-present rate so it never reads as 0%. */
const formatRate = (fraction: number) => {
  if (fraction <= 0) return "0%"
  if (fraction < 0.01) return "<1%"
  return `${Math.round(fraction * 100)}%`
}

/** One value, merged with the dimension it belongs to and the issue's trace total (the coverage denominator). */
type RankedPattern = DimensionPattern & {
  readonly dimension: (typeof DIMENSIONS)[number]
  readonly signalAffectedTraces: number
}

/** Renders the value with its native component, so its type is recognizable at a glance. */
function DimensionIdentity({ id, value }: { readonly id: SignalDimension; readonly value: string }) {
  switch (id) {
    case "tag":
      return <TagBadge tag={value} />
    case "provider":
      return (
        <div className="flex min-w-0 flex-row items-center gap-1.5">
          <ProviderIcon provider={value} size="sm" />
          <Text.H6 color="foreground" className="truncate">
            {value}
          </Text.H6>
        </div>
      )
    case "tool":
      return (
        <div className="flex min-w-0 flex-row items-center gap-1.5">
          <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <Text.H6 color="foreground" className="truncate font-mono">
            {value}
          </Text.H6>
        </div>
      )
    case "finishReason":
      return <Status variant="neutral" label={value} indicator={false} />
    default:
      return (
        <Text.H6 color="foreground" className="truncate">
          {value}
        </Text.H6>
      )
  }
}

function PatternRow({ pattern }: { readonly pattern: RankedPattern }) {
  const { dimension, value, conditionalRate, coverage, affectedTraces, totalTraces, signalAffectedTraces } = pattern
  // Two lines: identity + rate, then the bar. The metric's meaning is established
  // once by the panel caption; the full sentence + counts live in the tooltip.
  return (
    <Tooltip
      asChild
      trigger={
        <div className="flex cursor-default flex-col gap-1">
          <div className="flex min-w-0 flex-row items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-row items-center">
              <DimensionIdentity id={dimension.id} value={value} />
            </div>
            <Text.H6 color="foreground" className="shrink-0 font-semibold tabular-nums">
              {formatRate(conditionalRate)}
            </Text.H6>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded bg-muted">
            <div
              className="h-full rounded bg-primary"
              style={{ width: `${Math.min(Math.round(conditionalRate * 100), 100)}%` }}
            />
          </div>
        </div>
      }
    >
      <div className="flex max-w-[280px] flex-col gap-1">
        <Text.H6>
          {formatCount(affectedTraces)} of the {formatCount(totalTraces)} traces with this{" "}
          <span className="font-semibold">{dimension.noun}</span> fall into this issue (
          <span className="font-semibold">{formatRate(conditionalRate)}</span>).
        </Text.H6>
        <Text.H6 color="foregroundMuted">
          This {dimension.noun} appears in {formatCount(affectedTraces)} of the issue's{" "}
          {formatCount(signalAffectedTraces)} traces ({formatRate(coverage)}).
        </Text.H6>
      </div>
    </Tooltip>
  )
}

/**
 * Patterns panel: a single vertical list of the dimension values (model /
 * provider / tool / tag / finish reason) whose traces most disproportionately
 * fall into this issue. Uses reverse conditioning (`P(issue | value)`): each row
 * states the share of that value's traces that are part of the issue. Ranked by
 * rate-elevation against the issue's base rate (shown once in the summary, not
 * per row); gated to a minimum elevation so near-baseline noise is dropped.
 * Bars stay on one shared vertical axis so values are comparable. Fills its
 * container and scrolls; the height is owned by the page layout so it matches
 * the Trend beside it. See `specs/issue-details-page.md` (Data model #2).
 */
export function SignalPatterns({ projectId, signalId }: { readonly projectId: string; readonly signalId: string }) {
  // One independent query per dimension, called at the top level (fixed order)
  // so the hook count is stable, then zipped with the dimension metadata.
  const model = useSignalDimensions({ projectId, signalId, dimension: "model" })
  const provider = useSignalDimensions({ projectId, signalId, dimension: "provider" })
  const tool = useSignalDimensions({ projectId, signalId, dimension: "tool" })
  const tag = useSignalDimensions({ projectId, signalId, dimension: "tag" })
  const finishReason = useSignalDimensions({ projectId, signalId, dimension: "finishReason" })
  const byId = { model, provider, tool, tag, finishReason } as const
  const results = DIMENSIONS.map((dimension) => ({ dimension, query: byId[dimension.id] }))

  const isLoading = results.some(({ query }) => query.isLoading)

  const ranked: RankedPattern[] = results
    .flatMap(({ dimension, query }) =>
      (query.data?.patterns ?? []).map((pattern) => ({
        ...pattern,
        dimension,
        signalAffectedTraces: query.data?.signalAffectedTraces ?? 0,
      })),
    )
    .sort((a, b) => b.rateElevation - a.rateElevation)

  return (
    <div className="flex h-full flex-col gap-3 rounded-lg bg-secondary p-4">
      <div className="flex flex-col gap-0.5">
        <Text.H6 color="foregroundMuted">What's unusual about this issue</Text.H6>
        {/* States the metric once so the bare per-row percentages aren't misread
            as "share of the issue's occurrences" (it's the reverse). */}
        <Text.H6 color="foregroundMuted" className="opacity-70">
          Share of each value's traces that are part of this issue
        </Text.H6>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {isLoading ? (
          [0, 1, 2].map((row) => <Skeleton key={row} className="h-7 w-full" />)
        ) : ranked.length === 0 ? (
          <Text.H6 color="foregroundMuted">Not enough data to compare against the project baseline yet.</Text.H6>
        ) : (
          ranked.map((pattern) => <PatternRow key={`${pattern.dimension.id}:${pattern.value}`} pattern={pattern} />)
        )}
      </div>
    </div>
  )
}
