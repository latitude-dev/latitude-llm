import type { TraceId } from "@domain/shared"
import { createCentroid, mergeCentroids, normalizeCentroid, normalizeEmbedding, updateCentroid } from "@domain/shared"
import {
  TAXONOMY_CENTROID_HALF_LIFE_SECONDS,
  TAXONOMY_EMBEDDING_DIMENSIONS,
  TAXONOMY_EMBEDDING_MODEL,
  TAXONOMY_OBSERVATION_WEIGHT_SCHEME,
  TAXONOMY_SESSION_DOCUMENT_MAX_LENGTH,
  type TaxonomyObservationWeightScheme,
} from "./constants.ts"
import type { TaxonomyCentroid } from "./entities/cluster.ts"

interface BuildSessionDocumentInput {
  readonly sessionId: string
  readonly messages: readonly unknown[]
  readonly traceIds: readonly TraceId[]
}

export interface SessionDocument {
  readonly conversationText: string
  readonly summaryPreview: string
  readonly primaryActor: "user" | "agent" | "both"
  readonly traceCount: number
  readonly firstTraceId: TraceId | null
  readonly lastTraceId: TraceId | null
}

const middleTruncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value
  const head = Math.floor((maxLength - 15) / 2)
  const tail = maxLength - 15 - head
  return `${value.slice(0, head)}\n[...truncated...]\n${value.slice(value.length - tail)}`
}

const stringifyPart = (part: unknown): string => {
  if (part === null || typeof part !== "object") return ""
  const p = part as Record<string, unknown>
  if (p.type === "text" && typeof p.content === "string") return p.content
  if (p.type === "tool_call") return `[TOOL CALL: ${typeof p.name === "string" ? p.name : "unknown"}]`
  if (p.type === "tool_call_response") return ""
  if (typeof p.content === "string") return p.content
  return ""
}

const messageRole = (message: unknown): "user" | "assistant" | null => {
  if (message === null || typeof message !== "object") return null
  const role = (message as { readonly role?: unknown }).role
  return role === "user" || role === "assistant" ? role : null
}

const messageText = (message: unknown): string => {
  if (message === null || typeof message !== "object") return ""
  const parts = (message as { readonly parts?: unknown }).parts
  if (!Array.isArray(parts)) return ""
  return parts.map(stringifyPart).filter(Boolean).join("\n").trim()
}

export const buildSessionDocument = (input: BuildSessionDocumentInput): SessionDocument => {
  let userTurns = 0
  let assistantTurns = 0
  const lines: string[] = []

  for (const message of input.messages) {
    const role = messageRole(message)
    if (role === null) continue
    const text = messageText(message)
    if (text.length === 0) continue
    if (role === "user") userTurns++
    if (role === "assistant") assistantTurns++
    lines.push(`${role === "user" ? "User" : "Assistant"}: ${text}`)
  }

  const conversationText = middleTruncate(lines.join("\n\n"), TAXONOMY_SESSION_DOCUMENT_MAX_LENGTH)
  const primaryActor = userTurns > 0 && assistantTurns > 0 ? "both" : userTurns > 0 ? "user" : "agent"

  return {
    conversationText,
    summaryPreview: conversationText.slice(0, 280),
    primaryActor,
    traceCount: input.traceIds.length,
    firstTraceId: input.traceIds[0] ?? null,
    lastTraceId: input.traceIds[input.traceIds.length - 1] ?? null,
  }
}

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
// Single-linkage agglomerative clustering — the noise-sweep births pass.
// ---------------------------------------------------------------------------

export interface SingleLinkageCandidate {
  /** Indices into the original `embeddings` array. */
  readonly members: readonly number[]
  /** Max pairwise cosine *distance* (1 - cosine) between any two members. */
  readonly diameter: number
}

export interface SingleLinkageClustersInput {
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
 * members. See `specs/live-taxonomy.md#a-noise-sweep-cluster-births`.
 */
export const singleLinkageClusters = (input: SingleLinkageClustersInput): readonly SingleLinkageCandidate[] => {
  const { embeddings, connectivityThreshold, minMembers, maxDiameter } = input
  const n = embeddings.length
  if (n === 0 || minMembers <= 0) return []

  // Union-find by rank.
  const parent = new Array<number>(n)
  const rank = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++) parent[i] = i

  const find = (x: number): number => {
    let root = x
    while (parent[root] !== root) root = parent[root] ?? root
    let node = x
    while (parent[node] !== root) {
      const next = parent[node] ?? node
      parent[node] = root
      node = next
    }
    return root
  }

  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return
    const rankA = rank[ra] ?? 0
    const rankB = rank[rb] ?? 0
    if (rankA < rankB) {
      parent[ra] = rb
    } else if (rankA > rankB) {
      parent[rb] = ra
    } else {
      parent[rb] = ra
      rank[ra] = rankA + 1
    }
  }

  // Build connected components by walking the upper triangle once.
  for (let i = 0; i < n; i++) {
    const left = embeddings[i]
    if (!left) continue
    for (let j = i + 1; j < n; j++) {
      const right = embeddings[j]
      if (!right) continue
      if (cosineSimilarityNormalized(left, right) >= connectivityThreshold) {
        union(i, j)
      }
    }
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    const bucket = groups.get(root)
    if (bucket) bucket.push(i)
    else groups.set(root, [i])
  }

  const candidates: SingleLinkageCandidate[] = []
  for (const members of groups.values()) {
    if (members.length < minMembers) continue
    // Compute diameter (max pairwise cosine distance).
    let maxDistance = 0
    for (let i = 0; i < members.length; i++) {
      const mi = members[i]
      if (mi === undefined) continue
      const left = embeddings[mi]
      if (!left) continue
      for (let j = i + 1; j < members.length; j++) {
        const mj = members[j]
        if (mj === undefined) continue
        const right = embeddings[mj]
        if (!right) continue
        const distance = 1 - cosineSimilarityNormalized(left, right)
        if (distance > maxDistance) maxDistance = distance
      }
    }
    if (maxDistance > maxDiameter) continue
    candidates.push({ members, diameter: maxDistance })
  }
  return candidates
}

// ---------------------------------------------------------------------------
// Agglomerative average-linkage — the category roll-up.
// ---------------------------------------------------------------------------

export interface AgglomerativeClusterInput {
  /** Already-normalized centroids (unit vectors). */
  readonly vectors: readonly (readonly number[])[]
  /** Target number of components. */
  readonly k: number
}

export interface AgglomerativeAssignment {
  /** Cluster index per input vector (0..k-1). */
  readonly assignments: readonly number[]
  /** Members per cluster, as indices into the original `vectors` array. */
  readonly clusters: readonly (readonly number[])[]
}

/**
 * Sub-millisecond pure-TS agglomerative average-linkage over already-clean
 * input vectors. Used for the 5–15 leaf-cluster → category roll-up.
 * `O(n³)` in the worst case; trivial at this K.
 */
export const agglomerativeCluster = (input: AgglomerativeClusterInput): AgglomerativeAssignment => {
  const { vectors, k } = input
  const n = vectors.length
  if (n === 0) return { assignments: [], clusters: [] }
  if (k <= 0) {
    return { assignments: new Array(n).fill(0), clusters: [Array.from({ length: n }, (_, i) => i)] }
  }
  if (n <= k) {
    return {
      assignments: Array.from({ length: n }, (_, i) => i),
      clusters: Array.from({ length: n }, (_, i) => [i]),
    }
  }

  // Each row is a working cluster (list of member indices).
  const groups: number[][] = Array.from({ length: n }, (_, i) => [i])

  // Pairwise average-linkage *similarity* matrix (only upper triangle used).
  // Built lazily on demand to avoid n² storage when n is small enough that
  // straight recomputation is simpler than maintenance.
  const groupSimilarity = (a: number[], b: number[]): number => {
    let sum = 0
    let count = 0
    for (const ai of a) {
      const va = vectors[ai]
      if (!va) continue
      for (const bi of b) {
        const vb = vectors[bi]
        if (!vb) continue
        sum += cosineSimilarityNormalized(va, vb)
        count++
      }
    }
    return count === 0 ? 0 : sum / count
  }

  while (groups.length > k) {
    let bestI = -1
    let bestJ = -1
    let bestSim = Number.NEGATIVE_INFINITY
    for (let i = 0; i < groups.length; i++) {
      const gi = groups[i]
      if (!gi) continue
      for (let j = i + 1; j < groups.length; j++) {
        const gj = groups[j]
        if (!gj) continue
        const sim = groupSimilarity(gi, gj)
        if (sim > bestSim) {
          bestSim = sim
          bestI = i
          bestJ = j
        }
      }
    }
    if (bestI < 0 || bestJ < 0) break
    const merged = [...(groups[bestI] ?? []), ...(groups[bestJ] ?? [])]
    // Remove the higher index first to keep the lower index stable.
    groups.splice(bestJ, 1)
    groups[bestI] = merged
  }

  const assignments = new Array<number>(n).fill(-1)
  for (let cluster = 0; cluster < groups.length; cluster++) {
    const members = groups[cluster]
    if (!members) continue
    for (const member of members) {
      assignments[member] = cluster
    }
  }
  return { assignments, clusters: groups }
}

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
 * centroid_embedding for a category from its member cluster centroids, and
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
