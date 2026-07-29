import type { ClassifiedUnpricedPair } from "@domain/spans"
import { Badge, Icon, Skeleton, Text, Tooltip } from "@repo/ui"
import { formatCount, formatPercentage, formatPrice } from "@repo/utils"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"
import type { CostConfidenceRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { microcentsToUsd } from "./cost-formatters.ts"

// Below this, enough usage is unpriced that the window's total understates spend.
const COVERAGE_WARNING_THRESHOLD = 0.98

const GAP_PAIRS_SHOWN = 5

const CAUSE_LABEL: Record<ClassifiedUnpricedPair["cause"], string> = {
  missingPricing: "no pricing",
  ingestGap: "priced now, recorded at $0",
  freePricing: "free",
}

function ProvenanceLine({ confidence }: { readonly confidence: CostConfidenceRecord }) {
  const recorded = confidence.verifiedMicrocents + confidence.estimatedMicrocents
  // The provider-reported share is a statement of method, not a quality score:
  // almost no instrumentation reports cost, so it never moves. Priced coverage
  // above is the figure that does.
  const verifiedShare = recorded > 0 ? confidence.verifiedMicrocents / recorded : 0

  return (
    <div className="flex items-center gap-1">
      <Text.H6 color="foregroundMuted">
        Priced by Latitude from token counts
        {recorded > 0 ? ` · ${formatPercentage(verifiedShare)} reported by providers` : null}
      </Text.H6>
      <Tooltip
        asChild
        trigger={
          <span className="inline-flex cursor-default">
            <Icon icon={InfoIcon} size="sm" color="foregroundMuted" />
          </span>
        }
      >
        A call's cost is either reported by the provider or priced by us from its token counts, never both. Most
        instrumentation does not report cost, so nearly every figure here is our own pricing —{" "}
        {formatPrice(microcentsToUsd(confidence.verifiedMicrocents))} of {formatPrice(microcentsToUsd(recorded))} came
        from providers. Long-context pricing tiers are not applied yet, so very large prompts read slightly low.
      </Tooltip>
    </div>
  )
}

function GapPairList({ pairs }: { readonly pairs: readonly ClassifiedUnpricedPair[] }) {
  return (
    <div className="flex flex-col gap-1">
      {pairs.slice(0, GAP_PAIRS_SHOWN).map((pair) => (
        <div key={`${pair.provider}/${pair.model}`} className="flex items-center gap-2">
          <Text.H6 color="foreground" ellipsis noWrap>
            {pair.model || "unknown model"}
          </Text.H6>
          <Text.H6 color="foregroundMuted" noWrap>
            {pair.provider || "unknown provider"} · {formatCount(pair.tokens)} tokens · {formatCount(pair.calls)} calls
          </Text.H6>
          <Badge variant="muted" size="small">
            {CAUSE_LABEL[pair.cause]}
          </Badge>
        </div>
      ))}
      {pairs.length > GAP_PAIRS_SHOWN ? (
        <Text.H6 color="foregroundMuted">and {pairs.length - GAP_PAIRS_SHOWN} more</Text.H6>
      ) : null}
    </div>
  )
}

/**
 * What the page can and cannot stand behind. Load-bearing rather than a footnote:
 * every figure above is only as exact as the pricing behind it.
 */
export function CostConfidenceStrip({
  confidence,
  isLoading,
}: {
  readonly confidence: CostConfidenceRecord | undefined
  readonly isLoading: boolean
}) {
  if (isLoading || !confidence) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
    )
  }

  const coverage = confidence.pricedCoverage
  const hasGap = confidence.gapPairs.length > 0
  const isBelowThreshold = coverage !== null && coverage < COVERAGE_WARNING_THRESHOLD

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Icon
              icon={isBelowThreshold ? TriangleAlertIcon : CircleCheckIcon}
              size="sm"
              color={isBelowThreshold ? "warningMutedForeground" : "foregroundMuted"}
            />
            <Text.H5 color="foreground" className="tabular-nums">
              {coverage === null ? "No billable usage yet" : `${formatPercentage(coverage)} of usage priced`}
            </Text.H5>
          </div>
          <ProvenanceLine confidence={confidence} />
        </div>
        {hasGap ? (
          <div className="flex flex-col gap-1">
            <Text.H6 color="foregroundMuted">
              {formatCount(confidence.gapTokens)} tokens on {formatCount(confidence.gapCalls)} calls recorded no cost
            </Text.H6>
            <GapPairList pairs={confidence.gapPairs} />
          </div>
        ) : (
          <Text.H6 color="foregroundMuted">
            Every model in this window has pricing
            {confidence.freeTokens > 0 ? ` (${formatCount(confidence.freeTokens)} tokens on free models)` : null}.
          </Text.H6>
        )}
      </div>
    </div>
  )
}
