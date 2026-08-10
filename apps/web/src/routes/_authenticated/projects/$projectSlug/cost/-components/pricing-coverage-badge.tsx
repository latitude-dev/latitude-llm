import type { ClassifiedUnpricedPair } from "@domain/spans"
import { Text, Tooltip } from "@repo/ui"
import { formatCount, formatPercentage } from "@repo/utils"
import type { CostConfidenceRecord } from "../../../../../../domains/cost/cost.functions.ts"

const GAP_PAIRS_SHOWN = 5

function GapPairRow({ pair }: { readonly pair: ClassifiedUnpricedPair }) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <Text.H6 weight="medium" color="background" textOpacity={80} ellipsis noWrap>
        {pair.model || "unknown model"}
      </Text.H6>
      <Text.H6 color="background" textOpacity={80} noWrap className="shrink-0">
        {`${formatCount(pair.tokens)} tokens`}
      </Text.H6>
    </div>
  )
}

/**
 * Whether the window's spend can be trusted, collapsed into one badge next to the page
 * title — the detail a standalone strip used to take a whole row for now lives in its tooltip.
 */
export function PricingCoverageBadge({
  confidence,
  isLoading,
}: {
  readonly confidence: CostConfidenceRecord | undefined
  readonly isLoading: boolean
}) {
  if (isLoading || !confidence || confidence.pricedCoverage === null) return null

  const fullyPriced = confidence.gapPairs.length === 0 && confidence.gapTokens <= 0
  // Zero-cost usage stored before `costSource` existed cannot say whether it was free or
  // unpriced, so a window with any of it can only ever be a lower bound on coverage.
  const isLowerBound = confidence.unknownTokens > 0

  return (
    <Tooltip
      variant="inverse"
      maxWidth="max-w-64"
      className="p-2"
      triggerBadge={{
        variant: "accent",
        children: `${isLowerBound ? "At least " : ""}${formatPercentage(confidence.pricedCoverage)} priced`,
      }}
    >
      <div className="flex flex-col gap-3 text-left">
        <div className="flex flex-col gap-1">
          <Text.H5M color="background">{fullyPriced ? "Usage fully priced" : "Usage not fully priced"}</Text.H5M>
          <Text.H6 color="background" textOpacity={80}>
            {fullyPriced
              ? `Every model in this window has pricing${
                  confidence.freeTokens > 0 ? ` (${formatCount(confidence.freeTokens)} tokens on free models)` : ""
                }`
              : `${formatCount(confidence.gapTokens)} tokens on ${formatCount(confidence.gapCalls)} calls recorded no cost`}
          </Text.H6>
        </div>
        {!fullyPriced && confidence.gapPairs.length > 0 ? (
          <div className="flex flex-col gap-1">
            {confidence.gapPairs.slice(0, GAP_PAIRS_SHOWN).map((pair) => (
              <GapPairRow key={`${pair.provider}/${pair.model}`} pair={pair} />
            ))}
            {confidence.gapPairs.length > GAP_PAIRS_SHOWN ? (
              <Text.H6 color="background" textOpacity={80}>
                {`and ${confidence.gapPairs.length - GAP_PAIRS_SHOWN} more`}
              </Text.H6>
            ) : null}
          </div>
        ) : null}
      </div>
    </Tooltip>
  )
}
