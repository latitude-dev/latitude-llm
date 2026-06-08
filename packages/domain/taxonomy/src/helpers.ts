import { createCentroid, mergeCentroids, normalizeCentroid, normalizeEmbedding, updateCentroid } from "@domain/shared"
import {
  TAXONOMY_CENTROID_HALF_LIFE_SECONDS,
  TAXONOMY_EMBEDDING_DIMENSIONS,
  TAXONOMY_EMBEDDING_MODEL,
  TAXONOMY_OBSERVATION_WEIGHT_SCHEME,
  TAXONOMY_PENDING_DISPLAY_NAME,
  type TaxonomyObservationWeightScheme,
} from "./constants.ts"
import type { TaxonomyCentroid } from "./entities/cluster.ts"

export const isDisplayableTaxonomyName = (name: string): boolean => name !== TAXONOMY_PENDING_DISPLAY_NAME

// ---------------------------------------------------------------------------
// Centroid wrappers — taxonomy-shaped delegators to @domain/shared/centroid.
// ---------------------------------------------------------------------------

export const createTaxonomyCentroid = (): TaxonomyCentroid =>
  createCentroid<TaxonomyObservationWeightScheme>({
    dimensions: TAXONOMY_EMBEDDING_DIMENSIONS,
    model: TAXONOMY_EMBEDDING_MODEL,
    halfLifeSeconds: TAXONOMY_CENTROID_HALF_LIFE_SECONDS,
    weights: TAXONOMY_OBSERVATION_WEIGHT_SCHEME,
  }) as TaxonomyCentroid

export interface UpdateTaxonomyCentroidInput {
  readonly centroid: TaxonomyCentroid & { readonly clusteredAt: Date }
  readonly embedding: readonly number[]
  /** Observation-specific weight; 1.0 for the MVP single-bucket scheme. */
  readonly weight: number
  /** Observation start time, used as the centroid's new `clusteredAt` anchor. */
  readonly timestamp: Date
  readonly operation: "add" | "remove"
  /** Carried explicitly so callers don't have to mutate the centroid object. */
  readonly previousClusteredAt: Date
}

/**
 * Apply a single observation contribution to a cluster centroid. Same running
 * decayed-sum math as `updateIssueCentroid`, delegated through the shared
 * `@domain/shared/centroid` primitive.
 */
export const updateTaxonomyCentroid = ({
  centroid,
  embedding,
  weight,
  timestamp,
  operation,
  previousClusteredAt,
}: UpdateTaxonomyCentroidInput): TaxonomyCentroid & { readonly clusteredAt: Date } =>
  updateCentroid<TaxonomyObservationWeightScheme>({
    centroid: { ...centroid, clusteredAt: previousClusteredAt },
    contribution: { embedding, createdAt: timestamp },
    contributionWeight: weight,
    operation,
    timestamp,
  }) as TaxonomyCentroid & { readonly clusteredAt: Date }

interface MergeTaxonomyCentroidsInput {
  readonly survivor: TaxonomyCentroid & { readonly clusteredAt: Date }
  readonly loser: TaxonomyCentroid & { readonly clusteredAt: Date }
  readonly timestamp: Date
}

/**
 * Decay survivor + loser running sums to `timestamp` and combine. Preserves
 * the loser's accumulated decayed mass — re-aggregating from raw observations
 * would zero out contributions older than ~one half-life.
 */
export const mergeTaxonomyCentroids = ({
  survivor,
  loser,
  timestamp,
}: MergeTaxonomyCentroidsInput): TaxonomyCentroid & { readonly clusteredAt: Date } =>
  mergeCentroids<TaxonomyObservationWeightScheme>({
    survivor,
    loser,
    timestamp,
  }) as TaxonomyCentroid & { readonly clusteredAt: Date }

export const normalizeTaxonomyCentroid = (centroid: TaxonomyCentroid): number[] => normalizeCentroid(centroid)

export const normalizeTaxonomyEmbedding = (embedding: readonly number[]): number[] => normalizeEmbedding(embedding)

// ---------------------------------------------------------------------------
// Cosine + softmax primitives
// ---------------------------------------------------------------------------

/**
 * Cosine similarity of two equally-sized vectors. Caller guarantees the
 * inputs come from the same embedding model so dimensions match.
 */
export const cosineSimilarity = (a: readonly number[], b: readonly number[]): number => {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0
  }
  let dot = 0
  let normA = 0
  let normB = 0
  for (let index = 0; index < a.length; index++) {
    const av = a[index] ?? 0
    const bv = b[index] ?? 0
    dot += av * bv
    normA += av * av
    normB += bv * bv
  }
  if (normA === 0 || normB === 0) return 0
  return dot / Math.sqrt(normA * normB)
}

/**
 * Cosine similarity for *already-normalized* (unit-length) vectors. The
 * gardening pipeline normalizes every embedding once at load time, so this
 * is the hot-path primitive — drops the per-call sqrt.
 */
export const cosineSimilarityNormalized = (a: readonly number[], b: readonly number[]): number => {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0
  }
  let dot = 0
  for (let index = 0; index < a.length; index++) {
    dot += (a[index] ?? 0) * (b[index] ?? 0)
  }
  return dot
}

/**
 * Softmax over similarity scores. Smaller temperature → sharper distribution.
 * Used by the two-gate assignment decision to compute relative margin.
 */
export const softmax = (values: readonly number[], temperature: number): number[] => {
  if (values.length === 0) return []
  const t = temperature > 0 ? temperature : 1
  let max = Number.NEGATIVE_INFINITY
  for (const v of values) {
    if (v > max) max = v
  }
  const exps = new Array<number>(values.length)
  let sum = 0
  for (let index = 0; index < values.length; index++) {
    const e = Math.exp(((values[index] ?? 0) - max) / t)
    exps[index] = e
    sum += e
  }
  if (sum === 0) return values.map(() => 0)
  for (let index = 0; index < exps.length; index++) {
    exps[index] /= sum
  }
  return exps
}

// ---------------------------------------------------------------------------
// Diameter-bounded greedy clustering — births and tree recursion.
// ---------------------------------------------------------------------------

interface SingleLinkageCandidate {
  /** Indices into the original `embeddings` array. */
  readonly members: readonly number[]
  /** Max pairwise cosine *distance* (1 - cosine) between any two members. */
  readonly diameter: number
}

interface DiameterBoundedClusterCandidate extends SingleLinkageCandidate {}

interface SingleLinkageClustersInput {
  /**
   * Already-normalized 2048-dim vectors (or whatever the embedding model
   * emits). Caller normalizes once at load time; this routine assumes dot
   * products equal cosine similarity.
   */
  readonly embeddings: readonly (readonly number[])[]
  /** Two embeddings are connected when cosine ≥ this. */
  readonly connectivityThreshold: number
  /** Reject candidate clusters with fewer than this many members. */
  readonly minMembers: number
  /** Reject candidates whose diameter exceeds this cosine *distance*. */
  readonly maxDiameter: number
}

/**
 * Connected-components clustering over a thresholded cosine graph.
 *
 * Naive `O(n²)` pairwise scan — fine at MVP scale (a few thousand noise
 * embeddings per pass). The diameter check cuts single-linkage chains that
 * would otherwise string two unrelated topics through a thin bridge of
 * members. See `dev-docs/taxonomy.md`.
 */
export const diameterBoundedGreedyClusters = (
  input: SingleLinkageClustersInput,
): readonly DiameterBoundedClusterCandidate[] => {
  const { embeddings, connectivityThreshold, minMembers, maxDiameter } = input
  if (embeddings.length === 0 || minMembers <= 0) return []

  const minAnchorSimilarity = 1 - maxDiameter
  const maxAnchors = 12
  const working: {
    members: number[]
    sum: number[]
    centroid: number[]
    anchors: number[]
  }[] = []

  const addToCluster = (cluster: (typeof working)[number], index: number, embedding: readonly number[]) => {
    cluster.members.push(index)
    if (cluster.sum.length === 0) cluster.sum = [...embedding]
    else {
      for (let dimension = 0; dimension < embedding.length; dimension++) {
        cluster.sum[dimension] = (cluster.sum[dimension] ?? 0) + (embedding[dimension] ?? 0)
      }
    }
    cluster.centroid = normalizeEmbedding(cluster.sum)
    if (cluster.anchors.length < maxAnchors) cluster.anchors.push(index)
  }

  for (let index = 0; index < embeddings.length; index++) {
    const embedding = embeddings[index]
    if (!embedding || embedding.length === 0) continue

    let bestCluster: (typeof working)[number] | null = null
    let bestSimilarity = connectivityThreshold
    for (const cluster of working) {
      if (embedding.length !== cluster.centroid.length) continue
      const centroidSimilarity = cosineSimilarityNormalized(embedding, cluster.centroid)
      if (centroidSimilarity < bestSimilarity) continue
      const withinAnchors = cluster.anchors.every((anchorIndex) => {
        const anchor = embeddings[anchorIndex]
        return anchor !== undefined && cosineSimilarityNormalized(embedding, anchor) >= minAnchorSimilarity
      })
      if (!withinAnchors) continue
      bestCluster = cluster
      bestSimilarity = centroidSimilarity
    }

    if (bestCluster) {
      addToCluster(bestCluster, index, embedding)
    } else {
      const cluster = { members: [], sum: [], centroid: [], anchors: [] }
      addToCluster(cluster, index, embedding)
      working.push(cluster)
    }
  }

  return working
    .filter((cluster) => cluster.members.length >= minMembers)
    .map((cluster) => {
      let maxObservedDistance = 0
      const sampledMembers = cluster.members.length <= 200 ? cluster.members : cluster.anchors
      for (let i = 0; i < sampledMembers.length; i++) {
        const leftIndex = sampledMembers[i]
        if (leftIndex === undefined) continue
        const left = embeddings[leftIndex]
        if (!left) continue
        for (let j = i + 1; j < sampledMembers.length; j++) {
          const rightIndex = sampledMembers[j]
          if (rightIndex === undefined) continue
          const right = embeddings[rightIndex]
          if (!right) continue
          const distance = 1 - cosineSimilarityNormalized(left, right)
          if (distance > maxObservedDistance) maxObservedDistance = distance
        }
      }
      return { members: cluster.members, diameter: maxObservedDistance }
    })
    .filter((cluster) => cluster.diameter <= maxDiameter)
}

export const quantileSorted = (sorted: readonly number[], q: number): number =>
  sorted.length === 0 ? 0 : (sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0)

// ---------------------------------------------------------------------------
// Farthest-Point Sampling — for cluster naming.
// ---------------------------------------------------------------------------

/**
 * Pick `budget` representatives from `vectors` by iteratively choosing the
 * one farthest from the already-selected set (cosine distance). Seeds from
 * the vector closest to the centroid (mean) so the first pick is the
 * canonical example.
 *
 * Returns indices into the original `vectors` array.
 */
export const farthestPointSample = (vectors: readonly (readonly number[])[], budget: number): readonly number[] => {
  const n = vectors.length
  if (n === 0 || budget <= 0) return []
  if (n <= budget) return Array.from({ length: n }, (_, i) => i)

  const dimensions = vectors[0]?.length ?? 0
  if (dimensions === 0) return []

  // Mean vector (centroid) of all inputs — used to pick the seed sample.
  const mean = new Array<number>(dimensions).fill(0)
  for (const v of vectors) {
    for (let i = 0; i < dimensions; i++) {
      mean[i] = (mean[i] ?? 0) + (v[i] ?? 0)
    }
  }
  for (let i = 0; i < dimensions; i++) {
    mean[i] = (mean[i] ?? 0) / n
  }

  // Closest-to-centroid seed.
  let seed = 0
  let seedDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < n; i++) {
    const v = vectors[i]
    if (!v) continue
    const distance = 1 - cosineSimilarity(v, mean)
    if (distance < seedDistance) {
      seedDistance = distance
      seed = i
    }
  }

  const selected: number[] = [seed]
  const minDistanceToSelected = new Array<number>(n).fill(Number.POSITIVE_INFINITY)
  const seedVec = vectors[seed]
  if (seedVec) {
    for (let i = 0; i < n; i++) {
      const v = vectors[i]
      if (!v) continue
      minDistanceToSelected[i] = 1 - cosineSimilarity(v, seedVec)
    }
  }

  while (selected.length < budget) {
    let next = -1
    let nextDistance = Number.NEGATIVE_INFINITY
    for (let i = 0; i < n; i++) {
      const distance = minDistanceToSelected[i] ?? Number.NEGATIVE_INFINITY
      if (distance > nextDistance) {
        nextDistance = distance
        next = i
      }
    }
    if (next < 0) break
    selected.push(next)
    const nextVec = vectors[next]
    if (!nextVec) continue
    for (let i = 0; i < n; i++) {
      const v = vectors[i]
      if (!v) continue
      const distance = 1 - cosineSimilarity(v, nextVec)
      const current = minDistanceToSelected[i] ?? Number.POSITIVE_INFINITY
      if (distance < current) minDistanceToSelected[i] = distance
    }
  }
  return selected
}

// ---------------------------------------------------------------------------
// Misc utility primitives
// ---------------------------------------------------------------------------

export const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Compute the normalized mean of an array of vectors. Used to derive the
 * a roll-up centroid from member cluster centroids, and
 * to test absorption of a candidate birth against existing clusters.
 *
 * Returns an empty array when the input is empty or all-zero.
 */
export const meanNormalized = (vectors: readonly (readonly number[])[]): number[] => {
  if (vectors.length === 0) return []
  const dimensions = vectors[0]?.length ?? 0
  if (dimensions === 0) return []
  const accumulator = new Array<number>(dimensions).fill(0)
  let count = 0
  for (const v of vectors) {
    if (!v || v.length !== dimensions) continue
    for (let i = 0; i < dimensions; i++) {
      accumulator[i] = (accumulator[i] ?? 0) + (v[i] ?? 0)
    }
    count++
  }
  if (count === 0) return []
  for (let i = 0; i < dimensions; i++) {
    accumulator[i] = (accumulator[i] ?? 0) / count
  }
  return normalizeEmbedding(accumulator)
}
