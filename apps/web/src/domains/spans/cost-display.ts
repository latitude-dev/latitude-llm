import type { CostSource } from "@domain/spans"
import { formatPrice } from "@repo/utils"

const MICROCENTS_PER_USD = 100_000_000

export interface CostDisplay {
  /** What the cell shows: a price, `Free`, or `-` when the cost is not known. */
  readonly label: string
  /** Set when the shown value needs qualifying, e.g. a total that omits unpriced spans. */
  readonly note?: string
}

const NOT_KNOWN: CostDisplay = { label: "-" }

function unpricedNote(unpricedSpanCount: number): string {
  const spans = unpricedSpanCount === 1 ? "1 span" : `${unpricedSpanCount} spans`
  return `Excludes ${spans} whose model has no known pricing, so the real total may be higher.`
}

/**
 * Cost for a trace or session, where the total is a sum over spans.
 *
 * A zero total is never shown as free, unlike a single span. `unpricedSpanCount` reads 0 both for a
 * group where every span was priced and for any row rolled up before the column existed, so the two
 * cannot be told apart here. Claiming free would be wrong for every pre-existing trace.
 */
export function rollupCostDisplay({
  costTotalMicrocents,
  unpricedSpanCount,
  tokensTotal,
}: {
  readonly costTotalMicrocents: number
  readonly unpricedSpanCount: number
  readonly tokensTotal: number
}): CostDisplay {
  if (costTotalMicrocents > 0) {
    const label = formatPrice(costTotalMicrocents / MICROCENTS_PER_USD)
    return unpricedSpanCount > 0 ? { label, note: unpricedNote(unpricedSpanCount) } : { label }
  }
  if (unpricedSpanCount > 0) return { label: "-", note: unpricedNote(unpricedSpanCount) }
  if (tokensTotal > 0) {
    return { label: "-", note: "No cost recorded here. A group total cannot tell free apart from unpriced." }
  }
  return NOT_KNOWN
}

/**
 * What an estimate was priced against, when that is not what the harness reported.
 *
 * Silent when they agree, which is the common case — a note on every span would be noise. Each side
 * is compared on its own: a gateway changes the provider, a dated model id changes only the model.
 */
function pricedAsNote({
  provider,
  model,
  costPricedProvider,
  costPricedModel,
}: {
  readonly provider: string
  readonly model: string
  readonly costPricedProvider: string
  readonly costPricedModel: string
}): string | undefined {
  if (!costPricedProvider && !costPricedModel) return undefined

  const providerDiffers = costPricedProvider !== provider
  const modelDiffers = costPricedModel !== model
  if (!providerDiffers && !modelDiffers) return undefined

  if (providerDiffers && modelDiffers) return `Estimated from ${costPricedProvider} / ${costPricedModel} pricing.`
  if (providerDiffers) return `Estimated from ${costPricedProvider} pricing.`
  return `Estimated from ${costPricedModel} pricing.`
}

/**
 * Cost for a single span, where `costSource` says outright whether a zero is real.
 */
export function spanCostDisplay({
  costTotalMicrocents,
  costSource,
  provider,
  model,
  costPricedProvider,
  costPricedModel,
}: {
  readonly costTotalMicrocents: number
  readonly costSource: CostSource
  readonly provider: string
  readonly model: string
  readonly costPricedProvider: string
  readonly costPricedModel: string
}): CostDisplay {
  const pricedAs = pricedAsNote({ provider, model, costPricedProvider, costPricedModel })

  if (costTotalMicrocents > 0) {
    const label = formatPrice(costTotalMicrocents / MICROCENTS_PER_USD)
    return pricedAs ? { label, note: pricedAs } : { label }
  }

  switch (costSource) {
    case "provider_reported":
    case "estimated":
      return pricedAs ? { label: "Free", note: pricedAs } : { label: "Free" }
    case "unpriced":
      return { label: "-", note: "This model has no known pricing, so its cost is not counted." }
    case "no_tokens":
      return NOT_KNOWN
    case "unknown":
      return { label: "-", note: "Recorded before cost sources were tracked, so a zero cannot be read as free." }
  }
}
