/** Above this many grouped causes the exact subset sum stops being affordable and sampling starts. */
export const EXACT_ATTRIBUTION_CAUSE_LIMIT = 12

/** Permutation ceiling for the sampled path, so a wide cause list cannot stall a daily job. */
export const MAX_ATTRIBUTION_PERMUTATIONS = 2_000

/** Standard error, in score points, at which sampling stops early. */
export const DEFAULT_ATTRIBUTION_ERROR_TARGET = 0.05

export interface CauseAttribution {
  readonly causeId: string
  /**
   * The cause's Shapley share of the dimension's distance from healthy, in score points.
   *
   * These add to the attributed deficit, which is what makes them rankable against each other. They
   * are not a promise: removing a cause returns its fix gain, not its share.
   */
  readonly attributedDeficit: number
  /**
   * Score recovered if this cause alone disappeared and everything else stayed as observed.
   *
   * Overlapping by construction: two causes that fail the same sessions each recover those sessions
   * on their own, so summing fix gains would count them twice. The field is separate from
   * `attributedDeficit` for exactly that reason, and nothing may add these up.
   */
  readonly fixGain: number
}

export type AttributionMethod = "exact" | "sampled"

export interface DeficitAttribution {
  readonly causes: readonly CauseAttribution[]
  /** Deficit no named cause accounts for: estimation error, and evidence nothing was fitted to. */
  readonly residual: number
  /** The dimension's whole distance from healthy, which the rows and the residual must add up to. */
  readonly totalDeficit: number
  /**
   * What the named causes alone account for.
   *
   * Above `totalDeficit` when the cause model is a coarser view of the dimension than the estimator
   * that produced the published number — a family cap applied over pooled units rather than per
   * session, say. The shares are scaled down to fit in that case, so the rows never claim more than
   * the score actually lost, and the gap stays visible here rather than being absorbed silently.
   */
  readonly explainedDeficit: number
  readonly method: AttributionMethod
  readonly evaluations: number
  /** Standard error of the sampled shares, in score points. Absent on the exact path. */
  readonly approximationError?: number
}

export interface AttributeDeficitInput {
  readonly causeIds: readonly string[]
  /**
   * The dimension's score with only these causes contributing.
   *
   * Called many times, so a caller that reduces its evidence to a small summary first will be much
   * faster than one that walks every session per call.
   */
  readonly scoreWith: (activeCauses: ReadonlySet<string>) => number
  /** The score with no cause contributing, which is what the deficit is measured from. */
  readonly healthyScore: number
  /** The dimension's published score. Anything it is below `scoreWith(all)` becomes residual. */
  readonly observedScore: number
  readonly seed?: number
  readonly maxPermutations?: number
  readonly errorTarget?: number
}

/** Mulberry32, so a sampled attribution is reproducible from its seed alone. */
const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

const logFactorials = (upTo: number): number[] => {
  const values = [0]
  for (let index = 1; index <= upTo; index++) values.push((values[index - 1] as number) + Math.log(index))
  return values
}

/**
 * Exact Shapley over every subset, memoised by bitmask.
 *
 * The textbook definition is an average over orderings, which at twelve causes is half a billion of
 * them. The subset form is the same number: each subset is evaluated once and enters every cause's
 * sum with the weight that counts how many orderings would have produced it. Four thousand
 * evaluations instead.
 */
const exactShapley = ({
  causeIds,
  deficitOf,
}: {
  readonly causeIds: readonly string[]
  readonly deficitOf: (mask: number) => number
}): { readonly shares: number[]; readonly evaluations: number } => {
  const count = causeIds.length
  const cache = new Map<number, number>()
  const value = (mask: number): number => {
    const cached = cache.get(mask)
    if (cached !== undefined) return cached
    const computed = deficitOf(mask)
    cache.set(mask, computed)
    return computed
  }

  const logFactorial = logFactorials(count)
  const shares = new Array<number>(count).fill(0)

  for (let mask = 0; mask < 1 << count; mask++) {
    for (let index = 0; index < count; index++) {
      const bit = 1 << index
      if (mask & bit) continue
      const size = popCount(mask)
      const weight = Math.exp(
        (logFactorial[size] as number) + (logFactorial[count - size - 1] as number) - (logFactorial[count] as number),
      )
      shares[index] = (shares[index] as number) + weight * (value(mask | bit) - value(mask))
    }
  }

  return { shares, evaluations: cache.size }
}

const popCount = (mask: number): number => {
  let count = 0
  let value = mask
  while (value) {
    value &= value - 1
    count += 1
  }
  return count
}

/**
 * Seeded permutation sampling, stopping once the shares are stable enough to rank by.
 *
 * Each permutation walks the causes in a random order and credits every one with what it added to
 * the deficit at that point. The running standard error says how far the mean might still move; a
 * cause list too wide to enumerate is ranked, not measured to the last point, and the error is
 * reported so the page can decline to show a row it cannot separate from its neighbour.
 */
const sampledShapley = ({
  causeIds,
  deficitOf,
  seed,
  maxPermutations,
  errorTarget,
}: {
  readonly causeIds: readonly string[]
  readonly deficitOf: (mask: number) => number
  readonly seed: number
  readonly maxPermutations: number
  readonly errorTarget: number
}): { readonly shares: number[]; readonly evaluations: number; readonly error: number } => {
  const count = causeIds.length
  const random = seededRandom(seed)
  const totals = new Array<number>(count).fill(0)
  const squares = new Array<number>(count).fill(0)
  const order = causeIds.map((_, index) => index)
  let evaluations = 0
  let permutations = 0
  let error = Number.POSITIVE_INFINITY

  while (permutations < maxPermutations) {
    for (let index = order.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1))
      const held = order[index] as number
      order[index] = order[swap] as number
      order[swap] = held
    }

    let mask = 0
    let previous = deficitOf(0)
    evaluations += 1
    for (const index of order) {
      mask |= 1 << index
      const next = deficitOf(mask)
      evaluations += 1
      const marginal = next - previous
      totals[index] = (totals[index] as number) + marginal
      squares[index] = (squares[index] as number) + marginal * marginal
      previous = next
    }
    permutations += 1

    if (permutations < 32) continue
    error = Math.max(
      ...totals.map((total, index) => {
        const mean = total / permutations
        const variance = Math.max(0, (squares[index] as number) / permutations - mean * mean)
        return Math.sqrt(variance / permutations)
      }),
    )
    if (error <= errorTarget) break
  }

  return { shares: totals.map((total) => total / permutations), evaluations, error }
}

/**
 * Splits a dimension's deficit across the causes that produced it.
 *
 * Attribution runs after the score, never as part of it: the number is already fixed, and this only
 * decides how to explain it. Shapley is the choice because caps, floors and overlapping evidence
 * make a dimension non-additive — two causes that fail the same sessions are each individually
 * sufficient, and any scheme that credits them separately double-counts while any scheme that picks
 * one arbitrarily hides the other. Averaging over orderings is what splits them defensibly.
 *
 * The residual is not a rounding artefact. It holds sampling error and, more importantly, whatever
 * the named causes do not explain, so a page can say how much of a score nobody can yet account for
 * instead of implying the list is complete.
 */
export const attributeDeficit = (input: AttributeDeficitInput): DeficitAttribution => {
  const causeIds = [...input.causeIds]
  const totalDeficit = Math.max(0, input.healthyScore - input.observedScore)

  if (causeIds.length === 0) {
    return {
      causes: [],
      residual: totalDeficit,
      totalDeficit,
      explainedDeficit: 0,
      method: "exact",
      evaluations: 0,
    }
  }

  const deficitOf = (mask: number): number => {
    const active = new Set<string>()
    for (let index = 0; index < causeIds.length; index++) {
      if (mask & (1 << index)) active.add(causeIds[index] as string)
    }
    return input.healthyScore - input.scoreWith(active)
  }

  const attribution: { readonly shares: number[]; readonly evaluations: number; readonly error?: number } =
    causeIds.length <= EXACT_ATTRIBUTION_CAUSE_LIMIT
      ? exactShapley({ causeIds, deficitOf })
      : sampledShapley({
          causeIds,
          deficitOf,
          seed: input.seed ?? 1,
          maxPermutations: input.maxPermutations ?? MAX_ATTRIBUTION_PERMUTATIONS,
          errorTarget: input.errorTarget ?? DEFAULT_ATTRIBUTION_ERROR_TARGET,
        })

  const everything = new Set(causeIds)
  const scoreWithEverything = input.scoreWith(everything)
  const explainedDeficit = Math.max(0, input.healthyScore - scoreWithEverything)
  const rawShares = causeIds.map((_, index) => Math.max(0, attribution.shares[index] as number))
  const rawTotal = rawShares.reduce((total, share) => total + share, 0)
  const scale = rawTotal > totalDeficit && rawTotal > 0 ? totalDeficit / rawTotal : 1

  const causes = causeIds.map((causeId, index): CauseAttribution => {
    const without = new Set(everything)
    without.delete(causeId)
    return {
      causeId,
      attributedDeficit: (rawShares[index] as number) * scale,
      fixGain: Math.max(0, input.scoreWith(without) - scoreWithEverything),
    }
  })

  const attributed = causes.reduce((total, cause) => total + cause.attributedDeficit, 0)

  return {
    causes,
    residual: Math.max(0, totalDeficit - attributed),
    explainedDeficit,
    totalDeficit,
    method: attribution.error === undefined ? "exact" : "sampled",
    evaluations: attribution.evaluations,
    ...(attribution.error === undefined ? {} : { approximationError: attribution.error }),
  }
}
