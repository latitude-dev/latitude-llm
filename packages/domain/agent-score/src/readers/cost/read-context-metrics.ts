import type { CostMetricReading, CostReadingBase, CostReadingLimitation } from "../../entities/cost-metric-reading.ts"
import { notApplicableReading, unreadableReading } from "../../entities/cost-metric-reading.ts"
import { repeatedAtomTokens, type SessionContentLedger } from "./content-atom-ledger.ts"

const REDUNDANT_INPUT_BASE = {
  metricId: "context.redundant_input_share",
  family: "context",
  rawUnit: "inputTokens",
  aggregation: "resourceRatio",
} as const satisfies CostReadingBase

const AVOIDABLE_PRESSURE_BASE = {
  metricId: "context.avoidable_pressure",
  family: "context",
  rawUnit: "contextLimitTokens",
  aggregation: "sessionMean",
} as const satisfies CostReadingBase

/**
 * An atom another reader established as redundant, with the cause that established it.
 *
 * Repetition alone is never enough: the ledger can see that a payload rode along in six prompts,
 * but only the tool, memory or definition reader can say the agent had no reason to keep sending
 * it. Without a cause the tokens stay display-only.
 */
export interface RedundantAtomClaim {
  readonly atomId: string
  readonly cause: string
}

const redundantTokensByAtom = ({
  ledger,
  claims,
}: {
  readonly ledger: SessionContentLedger
  readonly claims: readonly RedundantAtomClaim[]
}): Map<string, number> => {
  const tokens = new Map<string, number>()
  for (const claim of claims) {
    if (tokens.has(claim.atomId)) continue
    const repeated = repeatedAtomTokens({ ledger, atomId: claim.atomId })
    if (repeated > 0) tokens.set(claim.atomId, repeated)
  }
  return tokens
}

const tokenizerLimitations = (ledger: SessionContentLedger): CostReadingLimitation[] => {
  const limitations: CostReadingLimitation[] = []
  if (ledger.unreadableGenerationCount > 0) limitations.push("missingContent")
  return limitations
}

/**
 * `context.redundant_input_share` — attributable redundant input tokens over readable input tokens.
 *
 * Only claimed atoms count, and only beyond their first prompt. Raw prompt size never enters:
 * a large prompt that every generation needed is the work, not waste. Estimates come from an
 * approximate tokenizer, so the impact carries an identification bound rather than a token count.
 */
export const readRedundantInputShare = ({
  ledger,
  claims,
}: {
  readonly ledger: SessionContentLedger
  readonly claims: readonly RedundantAtomClaim[]
}): CostMetricReading => {
  if (ledger.readableGenerationCount === 0 && ledger.unreadableGenerationCount === 0) {
    return notApplicableReading(REDUNDANT_INPUT_BASE)
  }
  if (ledger.readableInputTokens === 0) {
    return unreadableReading(REDUNDANT_INPUT_BASE, ["missingContent"])
  }

  const tokens = redundantTokensByAtom({ ledger, claims })
  const redundantTokens = Math.min(
    ledger.readableInputTokens,
    [...tokens.values()].reduce((total, value) => total + value, 0),
  )

  return {
    ...REDUNDANT_INPUT_BASE,
    applicability: "applicable",
    readability: "readable",
    rawValue: redundantTokens / ledger.readableInputTokens,
    eligibleUnits: ledger.readableInputTokens,
    adverseUnits: redundantTokens,
    observations: [...tokens.entries()].map(([atomId, value]) => ({
      atomId,
      eligibleUnits: value,
      adverseUnits: value,
    })),
    evidence: "modeled",
    nativeImpact:
      redundantTokens > 0
        ? {
            unit: "inputTokens",
            point: redundantTokens,
            lower: 0,
            upper: redundantTokens,
            interpretation: "identificationBound",
          }
        : { unit: "inputTokens", point: 0 },
    limitations: tokenizerLimitations(ledger),
  }
}

/**
 * `context.avoidable_pressure` — the mean share of each generation's context window taken by
 * redundant content.
 *
 * Averaged per generation rather than pooled, because pressure is felt per call: one prompt at 90%
 * of the window is a different problem from ten at 9%. Generations with no known context limit are
 * excluded from the mean and lower coverage, never counted as roomy.
 */
export const readAvoidablePressure = ({
  ledger,
  claims,
}: {
  readonly ledger: SessionContentLedger
  readonly claims: readonly RedundantAtomClaim[]
}): CostMetricReading => {
  const sized = ledger.generations.filter(
    (generation) => generation.modelContextLimitTokens !== null && generation.modelContextLimitTokens > 0,
  )
  if (ledger.generations.length === 0) return notApplicableReading(AVOIDABLE_PRESSURE_BASE)
  if (sized.length === 0) return unreadableReading(AVOIDABLE_PRESSURE_BASE, ["unknownModelContext"])

  const claimed = new Set(claims.map((claim) => claim.atomId))
  const shares = sized.map((generation) => {
    const limit = generation.modelContextLimitTokens as number
    const redundantTokens = generation.atomIds
      .filter((atomId) => claimed.has(atomId))
      .reduce((total, atomId) => total + (ledger.atomsById.get(atomId)?.estimatedTokens ?? 0), 0)
    return { spanId: generation.spanId, share: Math.min(1, redundantTokens / limit), redundantTokens, limit }
  })
  const meanShare = shares.reduce((total, entry) => total + entry.share, 0) / shares.length
  const limitations: CostReadingLimitation[] = [
    ...tokenizerLimitations(ledger),
    ...(sized.length < ledger.generations.length ? (["unknownModelContext"] as const) : []),
  ]

  return {
    ...AVOIDABLE_PRESSURE_BASE,
    applicability: "applicable",
    readability: "readable",
    rawValue: meanShare,
    eligibleUnits: sized.reduce((total, generation) => total + (generation.modelContextLimitTokens as number), 0),
    adverseUnits: shares.reduce((total, entry) => total + Math.min(entry.limit, entry.redundantTokens), 0),
    observations: shares
      .filter((entry) => entry.redundantTokens > 0)
      .map((entry) => ({
        atomId: `generation:${entry.spanId}`,
        eligibleUnits: entry.limit,
        adverseUnits: Math.min(entry.limit, entry.redundantTokens),
      })),
    evidence: "modeled",
    limitations: [...new Set(limitations)],
  }
}
