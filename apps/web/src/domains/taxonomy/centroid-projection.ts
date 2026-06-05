/**
 * Project high-dimensional cluster centroid unit vectors onto 2D for the
 * behaviour map. Classic PCA via power iteration (top-2 principal
 * components with deflation) — O(iterations * n * dim), no dependencies,
 * fully deterministic so the layout is stable across requests.
 *
 * Coordinates are normalized to [0, 1] per axis; the client scales them
 * into its viewport. Semantically close clusters land close together.
 */

export interface CentroidPoint2D {
  readonly x: number
  readonly y: number
}

const POWER_ITERATIONS = 60
const CONVERGENCE_EPSILON = 1e-12

/** Deterministic LCG so the principal-component seed never flips the layout. */
const createSeededRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

const l2Norm = (vector: Float64Array): number => {
  let sum = 0
  for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i]
  return Math.sqrt(sum)
}

/** scores[i] = rows[i] · direction */
const projectRows = (rows: readonly Float64Array[], direction: Float64Array): Float64Array => {
  const scores = new Float64Array(rows.length)
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    let dot = 0
    for (let i = 0; i < row.length; i++) dot += row[i] * direction[i]
    scores[r] = dot
  }
  return scores
}

/**
 * Top principal component of the (already centered) rows via power
 * iteration on the implicit covariance: v ← Xᵀ(Xv) / ‖Xᵀ(Xv)‖.
 * Returns null when the rows carry no variance.
 */
const topPrincipalComponent = (rows: readonly Float64Array[], dim: number): Float64Array | null => {
  const random = createSeededRandom(0x5eed)
  let direction = new Float64Array(dim)
  for (let i = 0; i < dim; i++) direction[i] = random() - 0.5
  const initialNorm = l2Norm(direction)
  if (initialNorm === 0) return null
  for (let i = 0; i < dim; i++) direction[i] /= initialNorm

  for (let iteration = 0; iteration < POWER_ITERATIONS; iteration++) {
    const scores = projectRows(rows, direction)
    const next = new Float64Array(dim)
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      const score = scores[r]
      for (let i = 0; i < dim; i++) next[i] += score * row[i]
    }
    const norm = l2Norm(next)
    if (norm < CONVERGENCE_EPSILON) return null
    for (let i = 0; i < dim; i++) next[i] /= norm
    direction = next
  }
  return direction
}

/** Map raw component scores to [0, 1]; a degenerate axis collapses to 0.5. */
const normalizeScores = (scores: Float64Array): Float64Array => {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const score of scores) {
    if (score < min) min = score
    if (score > max) max = score
  }
  const range = max - min
  const normalized = new Float64Array(scores.length)
  for (let i = 0; i < scores.length; i++) {
    normalized[i] = range < CONVERGENCE_EPSILON ? 0.5 : (scores[i] - min) / range
  }
  return normalized
}

export const projectCentroidsTo2D = (
  centroidsById: ReadonlyMap<string, readonly number[]>,
): ReadonlyMap<string, CentroidPoint2D> => {
  const entries = [...centroidsById.entries()].filter(([, vector]) => vector.length > 0)
  if (entries.length === 0) return new Map()
  // Mixed embedding models would have mismatched dims; project the majority.
  const dim = entries[0][1].length
  const usable = entries.filter(([, vector]) => vector.length === dim)

  // Mean-center so the principal components capture spread, not the offset.
  const mean = new Float64Array(dim)
  for (const [, vector] of usable) {
    for (let i = 0; i < dim; i++) mean[i] += vector[i]
  }
  for (let i = 0; i < dim; i++) mean[i] /= usable.length
  const rows = usable.map(([, vector]) => {
    const row = new Float64Array(dim)
    for (let i = 0; i < dim; i++) row[i] = vector[i] - mean[i]
    return row
  })

  const first = topPrincipalComponent(rows, dim)
  const xScores = first ? projectRows(rows, first) : new Float64Array(rows.length)
  if (first) {
    // Deflate: remove the first component so the second iteration finds
    // the orthogonal direction of next-largest variance.
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      const score = xScores[r]
      for (let i = 0; i < dim; i++) row[i] -= score * first[i]
    }
  }
  const second = first ? topPrincipalComponent(rows, dim) : null
  const yScores = second ? projectRows(rows, second) : new Float64Array(rows.length)

  const xs = normalizeScores(xScores)
  const ys = normalizeScores(yScores)
  return new Map(usable.map(([id], index) => [id, { x: xs[index], y: ys[index] }]))
}
