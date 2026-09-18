import { type BinomialInterval, clopperPearsonInterval } from "./binomial-interval.ts"

export type StratifiedIntervalMethod = "exactBinomial" | "stratifiedBinomial"

/** One examined session, and the probability it had of being examined at all. */
interface StratifiedObservation {
  readonly inclusionProbability: number
  readonly event: boolean
}

interface EstimateStratifiedRateInput {
  readonly observations: readonly StratifiedObservation[]
  /**
   * Sessions known without sampling, which carry weight one each. A census
   * changes what the rate is a share of, so it belongs in the denominator even
   * though it draws no interval of its own.
   */
  readonly censusWeight?: number
  readonly censusEvents?: number
  readonly confidenceLevel?: number
}

interface StratifiedRateEstimate {
  /** The selection-corrected event rate, 0 through 1. */
  readonly rate: number
  readonly interval: BinomialInterval
  readonly method: StratifiedIntervalMethod
  readonly totalWeight: number
}

interface SubStratum {
  readonly inclusionProbability: number
  readonly examined: number
  readonly events: number
}

/**
 * Groups a sampled population by the probability that put each session in it.
 *
 * A project that changes its sampling rate mid-window produces more than one
 * group, and the groups are not interchangeable: each is its own binomial with
 * its own weight.
 */
const groupByInclusionProbability = (observations: readonly StratifiedObservation[]): readonly SubStratum[] => {
  const groups = new Map<number, { examined: number; events: number }>()
  for (const observation of observations) {
    const group = groups.get(observation.inclusionProbability) ?? { examined: 0, events: 0 }
    group.examined += 1
    if (observation.event) group.events += 1
    groups.set(observation.inclusionProbability, group)
  }

  return [...groups.entries()]
    .map(([inclusionProbability, group]) => ({ inclusionProbability, ...group }))
    .sort((left, right) => right.inclusionProbability - left.inclusionProbability)
}

/**
 * The selection-corrected rate of an event across a sampled population.
 *
 * Each sampled session stands for `1 / inclusionProbability` of them. The pooled
 * rate is a monotone function of the per-stratum sample rates, which is what
 * lets exact binomial intervals on the samples transform into an interval on the
 * pooled rate. Lower and upper bounds are never summed across strata.
 *
 * Shared by Outcome and Safety: one estimates a success rate against a census of
 * certain failures, the other a harm rate with no census, and only the transform
 * applied to the result differs.
 */
export const estimateStratifiedRate = (input: EstimateStratifiedRateInput): StratifiedRateEstimate => {
  const strata = groupByInclusionProbability(input.observations)
  const censusWeight = input.censusWeight ?? 0
  const censusEvents = input.censusEvents ?? 0
  const sampledWeight = strata.reduce((total, stratum) => total + stratum.examined / stratum.inclusionProbability, 0)
  const totalWeight = censusWeight + sampledWeight

  if (totalWeight === 0) {
    return { rate: 0, interval: { lower: 0, upper: 1 }, method: "exactBinomial", totalWeight }
  }

  const weightedEvents =
    censusEvents + strata.reduce((total, stratum) => total + stratum.events / stratum.inclusionProbability, 0)

  const bounds = strata.map((stratum) =>
    clopperPearsonInterval({
      successes: stratum.events,
      trials: stratum.examined,
      ...(input.confidenceLevel !== undefined ? { confidenceLevel: input.confidenceLevel } : {}),
    }),
  )

  const pooledBound = (pick: (interval: BinomialInterval) => number) =>
    (censusEvents +
      strata.reduce(
        (total, stratum, index) => total + (stratum.examined * pick(bounds[index]!)) / stratum.inclusionProbability,
        0,
      )) /
    totalWeight

  return {
    rate: weightedEvents / totalWeight,
    interval: { lower: pooledBound((interval) => interval.lower), upper: pooledBound((interval) => interval.upper) },
    // One group is a single binomial, so its transformed bounds are exact. More
    // than one assumes every group reaches its bound at once, which is wider
    // than a joint interval would be, so the label says which was used.
    method: strata.length === 1 ? "exactBinomial" : "stratifiedBinomial",
    totalWeight,
  }
}
