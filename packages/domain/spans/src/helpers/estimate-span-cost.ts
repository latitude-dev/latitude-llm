import { computeTokenCost, getCostSpec } from "@domain/models"
import type { CostSource } from "../entities/span.ts"

const MICROCENTS_PER_USD = 100_000_000

export const usdToMicrocents = (usd: number): number => Math.round(usd * MICROCENTS_PER_USD)

/** Additive counts: `input` excludes cache, `output` excludes reasoning. */
interface SpanTokenCounts {
  readonly tokensInput: number
  readonly tokensOutput: number
  readonly tokensCacheRead: number
  readonly tokensCacheCreate: number
  readonly tokensReasoning: number
}

type SpanCostEstimation =
  | {
      readonly kind: "estimated"
      readonly input: number
      readonly output: number
      /** Catalog entry the rates came from, often neither the reported provider nor the reported model. */
      readonly pricedProvider: string
      readonly pricedModel: string
    }
  /** Tokens were reported but no models.dev pricing matched the provider/model pair. */
  | { readonly kind: "unpriced" }
  | { readonly kind: "noTokens" }

const COST_SOURCE_BY_ESTIMATION: Record<SpanCostEstimation["kind"], CostSource> = {
  estimated: "estimated",
  unpriced: "unpriced",
  noTokens: "no_tokens",
}

const costSourceOf = (estimation: SpanCostEstimation): CostSource => COST_SOURCE_BY_ESTIMATION[estimation.kind]

const pricedPairOf = (estimation: SpanCostEstimation | undefined): { provider: string; model: string } =>
  estimation?.kind === "estimated"
    ? { provider: estimation.pricedProvider, model: estimation.pricedModel }
    : { provider: "", model: "" }

/**
 * Cost in microcents for a span's token counts, priced from models.dev.
 *
 * Cache and reasoning tokens carry their own rates but fold into the input and output sides, so
 * `input + output` is the total and the two stored columns always reconcile with it.
 *
 * Every sink that writes a span's cost goes through here — live ingestion and trace imports
 * both — so the same tokens on the same model cost the same however the span arrived, and a
 * stored `cost_source` classifies the same way on either.
 */
function estimateSpanCost({
  provider,
  model,
  tokensInput,
  tokensOutput,
  tokensCacheRead,
  tokensCacheCreate,
  tokensReasoning,
}: SpanTokenCounts & { readonly provider: string; readonly model: string }): SpanCostEstimation {
  if (tokensInput + tokensOutput + tokensCacheRead + tokensCacheCreate + tokensReasoning === 0) {
    return { kind: "noTokens" }
  }

  const { cost, costImplemented, pricedProvider, pricedModel } = getCostSpec(provider, model)
  if (!costImplemented) return { kind: "unpriced" }

  const inputUsd =
    computeTokenCost(cost, tokensInput, "input") +
    computeTokenCost(cost, tokensCacheRead, "cacheRead") +
    computeTokenCost(cost, tokensCacheCreate, "cacheWrite")

  const outputUsd =
    computeTokenCost(cost, tokensOutput, "output") + computeTokenCost(cost, tokensReasoning, "reasoning")

  return {
    kind: "estimated",
    input: usdToMicrocents(inputUsd),
    output: usdToMicrocents(outputUsd),
    pricedProvider,
    pricedModel,
  }
}

/**
 * Cost a source stated itself, in microcents.
 *
 * `undefined` and `0` mean different things and must not be conflated: absent is "the source said
 * nothing about this side", where `0` is the source stating the call was free. Conflating them is
 * what makes an unpriceable span look priced, and the unpriced rollup exists to surface exactly
 * those.
 */
interface ReportedSpanCost {
  readonly inputMicrocents?: number | undefined
  readonly outputMicrocents?: number | undefined
  readonly totalMicrocents?: number | undefined
}

interface ResolvedSpanCost {
  readonly costInputMicrocents: number
  readonly costOutputMicrocents: number
  readonly costTotalMicrocents: number
  readonly costIsEstimated: boolean
  readonly costSource: CostSource
  readonly costPricedProvider: string
  readonly costPricedModel: string
}

/**
 * What a span cost, from whatever the source stated and models.dev pricing for the rest.
 *
 * A stated figure always wins: the source saw the provider's real rate, including a discount or
 * negotiated price no public table knows. Estimation only fills what was not stated, per side — a
 * source that gives a total and no breakdown gets estimated sides beside its own total, rather than
 * two zeros that say the call was free on both halves.
 *
 * Every sink that writes a span's cost resolves it here — live ingestion, the OpenClaw embedded-usage
 * path and trace imports — so `cost_source` classifies on the same terms however the span arrived,
 * and a zero means the same thing in all three.
 */
export function resolveSpanCost({
  reported,
  provider,
  model,
  tokens,
}: {
  readonly reported: ReportedSpanCost
  readonly provider: string
  readonly model: string
  readonly tokens: SpanTokenCounts
}): ResolvedSpanCost {
  const { inputMicrocents, outputMicrocents, totalMicrocents } = reported

  const bothSidesReported = inputMicrocents !== undefined && outputMicrocents !== undefined
  // Positive, not merely present, for the sides: a zero side supplies no price on its own. A total is
  // enough at any value, including zero, which is a source pricing the call at nothing.
  const anyCostReported = (inputMicrocents ?? 0) > 0 || (outputMicrocents ?? 0) > 0 || totalMicrocents !== undefined

  const estimation = bothSidesReported ? undefined : estimateSpanCost({ provider, model, ...tokens })
  const estimated = estimation?.kind === "estimated" ? estimation : undefined

  const costInputMicrocents = inputMicrocents ?? estimated?.input ?? 0
  const costOutputMicrocents = outputMicrocents ?? estimated?.output ?? 0
  const costSource: CostSource =
    bothSidesReported || anyCostReported ? "provider_reported" : costSourceOf(estimation ?? { kind: "noTokens" })
  const sides = costInputMicrocents + costOutputMicrocents

  return {
    costInputMicrocents,
    costOutputMicrocents,
    // The source's own total when it gave one, so the sides reconciling to it is its arithmetic.
    costTotalMicrocents: totalMicrocents ?? (sides > 0 ? sides : 0),
    costIsEstimated: estimated !== undefined,
    costSource,
    // Gated on the source, not on `estimated`: a span can carry both a stated cost and an estimate,
    // and then the stored number is the source's, so no catalog entry produced it.
    costPricedProvider: costSource === "estimated" ? pricedPairOf(estimation).provider : "",
    costPricedModel: costSource === "estimated" ? pricedPairOf(estimation).model : "",
  }
}
