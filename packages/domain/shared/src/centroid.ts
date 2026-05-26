/**
 * Shared running-decayed-sum centroid math.
 *
 * Lifted from `@domain/issues/src/helpers.ts` so both `@domain/issues` and
 * `@domain/taxonomy` import the same primitives. Pure functions over a
 * generic `Centroid` shape — callers parameterize the model + weight scheme
 * via their own constants and a `weightForContribution` callback.
 */

const MILLISECONDS_PER_SECOND = 1000

export interface Centroid<Weights extends Record<string, number> = Record<string, number>> {
  /** Running sum of normalized, weighted, decayed contributions. */
  readonly base: readonly number[]
  /** Running scalar mass; tracks the weight sum. */
  readonly mass: number
  /** Embedding model used to compute the centroid. */
  readonly model: string
  /** Decay half-life in seconds. */
  readonly decay: number
  /** Source-weight scheme used to scale contributions. */
  readonly weights: Weights
}

const zeroVector = (dimensions: number) => new Array<number>(dimensions).fill(0)

function l2Norm(vector: ArrayLike<number>): number {
  let sum = 0
  for (let index = 0; index < vector.length; index++) {
    const value = vector[index] ?? 0
    sum += value * value
  }
  return Math.sqrt(sum)
}

/**
 * Shared L2-normalization primitive for centroid math.
 * Writes into a caller-provided buffer so the hot path can avoid extra arrays.
 */
function normalizeTo(out: Float32Array, src: ArrayLike<number>): void {
  const magnitude = l2Norm(src)
  const inverse = magnitude > 0 ? 1 / magnitude : 0

  for (let index = 0; index < src.length; index++) {
    out[index] = (src[index] ?? 0) * inverse
  }
}

function scaleInPlace(vector: Float32Array, scale: number): void {
  for (let index = 0; index < vector.length; index++) {
    vector[index] *= scale
  }
}

/**
 * Advance a persisted centroid state from `clusteredAt` to `timestamp`.
 * Mutates the working buffer in place for efficiency.
 */
export function applyDecay(
  base: Float32Array,
  mass: number,
  clusteredAt: Date,
  timestamp: Date,
  halfLifeSeconds: number,
): number {
  const delta = timestamp.getTime() - clusteredAt.getTime()
  if (delta <= 0) {
    return mass
  }

  const halfLifeMilliseconds = halfLifeSeconds * MILLISECONDS_PER_SECOND
  const alpha = 0.5 ** (delta / halfLifeMilliseconds)
  scaleInPlace(base, alpha)
  return mass * alpha
}

export interface CreateCentroidInput<Weights extends Record<string, number>> {
  readonly dimensions: number
  readonly model: string
  readonly halfLifeSeconds: number
  readonly weights: Weights
}

/**
 * Create a brand-new centroid with the supplied configuration.
 * Use when creating a new cluster/issue before any contributions exist.
 */
export const createCentroid = <Weights extends Record<string, number>>(
  input: CreateCentroidInput<Weights>,
): Centroid<Weights> => ({
  base: zeroVector(input.dimensions),
  mass: 0,
  model: input.model,
  decay: input.halfLifeSeconds,
  weights: { ...input.weights },
})

export interface UpdateCentroidInput<Weights extends Record<string, number>> {
  readonly centroid: Centroid<Weights> & { readonly clusteredAt: Date }
  readonly contribution: {
    readonly embedding: readonly number[]
    /** Time the contribution was originally observed; used for recency decay. */
    readonly createdAt: Date
  }
  /** Caller-supplied per-contribution multiplier (e.g. source weight). */
  readonly contributionWeight: number
  readonly operation: "add" | "remove"
  readonly timestamp: Date
}

/**
 * Canonical centroid update: decay the stored running sum/mass from
 * `clusteredAt` to `timestamp`, then add (or remove) the normalized,
 * weight-scaled, recency-decayed contribution.
 */
export const updateCentroid = <Weights extends Record<string, number>>({
  centroid,
  contribution,
  contributionWeight,
  operation,
  timestamp,
}: UpdateCentroidInput<Weights>): Centroid<Weights> & { readonly clusteredAt: Date } => {
  if (centroid.base.length !== contribution.embedding.length) {
    throw new Error(
      `Dimension mismatch: centroid has ${centroid.base.length}, contribution has ${contribution.embedding.length}`,
    )
  }

  const outBase = new Float32Array(centroid.base)
  let outMass = applyDecay(outBase, centroid.mass, centroid.clusteredAt, timestamp, centroid.decay)

  const halfLifeMilliseconds = centroid.decay * MILLISECONDS_PER_SECOND
  const elapsed = Math.max(0, timestamp.getTime() - contribution.createdAt.getTime())
  const recency = 0.5 ** (elapsed / halfLifeMilliseconds)
  const contributionMass = contributionWeight * recency

  const normalizedContribution = new Float32Array(contribution.embedding.length)
  normalizeTo(normalizedContribution, contribution.embedding)

  const sign = operation === "add" ? 1 : -1
  for (let index = 0; index < outBase.length; index++) {
    outBase[index] += sign * contributionMass * normalizedContribution[index]
  }

  outMass = operation === "add" ? outMass + contributionMass : outMass - contributionMass
  if (outMass <= 0) {
    return {
      ...centroid,
      base: zeroVector(outBase.length),
      mass: 0,
      clusteredAt: timestamp,
    }
  }

  return {
    ...centroid,
    base: Array.from(outBase),
    mass: outMass,
    clusteredAt: timestamp,
  }
}

/**
 * Convert the persisted running sum into the unit vector used for cosine
 * search. The stored `base` itself stays unnormalized.
 */
export const normalizeCentroid = <Weights extends Record<string, number>>(centroid: Centroid<Weights>): number[] => {
  if (centroid.mass <= 0 || centroid.base.length === 0) {
    return []
  }

  const normalized = new Float32Array(centroid.base)
  const magnitude = l2Norm(normalized)
  if (magnitude === 0) {
    return []
  }

  const inverse = 1 / magnitude
  for (let index = 0; index < normalized.length; index++) {
    normalized[index] *= inverse
  }

  return Array.from(normalized)
}

export interface MergeCentroidsInput<Weights extends Record<string, number>> {
  readonly survivor: Centroid<Weights> & { readonly clusteredAt: Date }
  readonly loser: Centroid<Weights> & { readonly clusteredAt: Date }
  readonly timestamp: Date
}

/**
 * Combine two persisted centroids into one. Decays each contributor's
 * running sum/mass to `timestamp` first, then sums the bases and masses.
 *
 * Use when collapsing a "loser" cluster into a "survivor" during gardening
 * — re-aggregating from raw observations would discard the decayed mass
 * already accumulated on the loser, so prefer this primitive.
 */
export const mergeCentroids = <Weights extends Record<string, number>>({
  survivor,
  loser,
  timestamp,
}: MergeCentroidsInput<Weights>): Centroid<Weights> & { readonly clusteredAt: Date } => {
  if (survivor.base.length !== loser.base.length) {
    throw new Error(`Dimension mismatch: survivor has ${survivor.base.length}, loser has ${loser.base.length}`)
  }

  const outBase = new Float32Array(survivor.base)
  const outMass = applyDecay(outBase, survivor.mass, survivor.clusteredAt, timestamp, survivor.decay)

  const loserBase = new Float32Array(loser.base)
  const loserMass = applyDecay(loserBase, loser.mass, loser.clusteredAt, timestamp, loser.decay)

  for (let index = 0; index < outBase.length; index++) {
    outBase[index] += loserBase[index] ?? 0
  }

  const totalMass = outMass + loserMass
  if (totalMass <= 0) {
    return {
      ...survivor,
      base: zeroVector(outBase.length),
      mass: 0,
      clusteredAt: timestamp,
    }
  }

  return {
    ...survivor,
    base: Array.from(outBase),
    mass: totalMass,
    clusteredAt: timestamp,
  }
}

/**
 * Normalize a raw embedding for query-time cosine search.
 * Retrieval code uses this for incoming query embeddings, while
 * `updateCentroid` handles normalization internally during state updates.
 */
export const normalizeEmbedding = (embedding: readonly number[]): number[] => {
  if (embedding.length === 0) {
    return []
  }

  const normalized = new Float32Array(embedding.length)
  normalizeTo(normalized, embedding)
  return Array.from(normalized)
}
