import { env } from '@latitude-data/env'
import { cache as getCache } from '../../cache'
import {
  EvaluationType,
  ISSUE_EMBEDDING_CACHE_KEY,
  ISSUE_EMBEDDING_MODEL,
  ISSUE_EVALUATION_WEIGHTS,
  ISSUE_HALF_LIFE,
  IssueCentroid,
} from '../../constants'
import { UnprocessableEntityError } from '../../lib/errors'
import { hashContent } from '../../lib/hashContent'
import { Result } from '../../lib/Result'
import { type Issue } from '../../schema/models/types/Issue'
import { voyage as getVoyageClient } from '../../voyage'

function l2norm(v: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < v.length; i++) s += (v[i] ?? 0) * (v[i] ?? 0)
  return Math.sqrt(s)
}

function normalizeTo(out: Float32Array, src: ArrayLike<number>): void {
  const n = l2norm(src)
  const inv = n > 0 ? 1 / n : 0
  for (let i = 0; i < src.length; i++) out[i] = (src[i] ?? 0) * inv
}

function scaleInPlace(v: Float32Array, scale: number): void {
  for (let i = 0; i < v.length; i++) v[i] *= scale
}

function applyDecay(
  base: Float32Array,
  weight: number,
  updatedAt: Date,
  timestamp: Date,
): number {
  if (!ISSUE_HALF_LIFE) return weight

  const delta = timestamp.getTime() - updatedAt.getTime()
  if (delta <= 0) return weight

  const lambda = Math.pow(0.5, delta / ISSUE_HALF_LIFE)
  scaleInPlace(base, lambda)
  return weight * lambda
}

export function createCentroid(): IssueCentroid {
  return { base: [], weight: 0 }
}

export function updateCentroid(
  centroid: IssueCentroid & { updatedAt: Date },
  result: {
    embedding: number[]
    type: EvaluationType
    createdAt: Date
  },
  operation: 'add' | 'remove',
  timestamp: Date,
): IssueCentroid {
  if (!env.WEAVIATE_API_KEY) return centroid

  if (centroid.base.length === 0) {
    centroid = {
      ...centroid,
      base: new Array(result.embedding.length).fill(0),
    }
  }

  if (centroid.base.length !== result.embedding.length) {
    throw new Error(
      `Dimension mismatch: centroid has ${centroid.base.length}, result has ${result.embedding.length}`,
    )
  }

  const now = timestamp.getTime()

  const outBase = new Float32Array(centroid.base)

  let outWeight = applyDecay(
    outBase,
    centroid.weight,
    centroid.updatedAt,
    timestamp,
  )

  const lambda = ISSUE_HALF_LIFE
    ? Math.pow(0.5, (now - result.createdAt.getTime()) / ISSUE_HALF_LIFE)
    : 1.0
  const wEff = (ISSUE_EVALUATION_WEIGHTS[result.type] ?? 1.0) * lambda

  const xhat = new Float32Array(result.embedding.length)
  normalizeTo(xhat, result.embedding)

  const sign = operation === 'add' ? 1 : -1
  for (let i = 0; i < outBase.length; i++) outBase[i] += sign * wEff * xhat[i]

  outWeight =
    operation === 'add' ? outWeight + wEff : Math.max(0, outWeight - wEff)

  // Convert back to number[] once at the end
  return { base: Array.from(outBase), weight: outWeight }
}

export function mergeCentroids(
  centroids: (IssueCentroid & { updatedAt: Date })[],
  timestamp: Date,
): IssueCentroid {
  if (centroids.length === 0) {
    throw new Error('Cannot merge empty centroids')
  }

  const anchor = centroids[0]
  if (centroids.length === 1) {
    return { base: anchor.base, weight: anchor.weight }
  }

  const mergedBase = new Float32Array(anchor.base)
  let mergedWeight = applyDecay(
    mergedBase,
    anchor.weight,
    anchor.updatedAt,
    timestamp,
  )

  for (const centroid of centroids.slice(1)) {
    const base = new Float32Array(centroid.base)
    if (base.length !== mergedBase.length) {
      throw new Error('Dimension mismatch while merging centroids.')
    }

    const weight = applyDecay(
      base,
      centroid.weight,
      centroid.updatedAt,
      timestamp,
    )

    for (let i = 0; i < mergedBase.length; i++) mergedBase[i] += base[i]
    mergedWeight += weight
  }

  // Convert back to number[] once at the end
  return { base: Array.from(mergedBase), weight: mergedWeight }
}

export function embedCentroid(centroid: IssueCentroid): number[] {
  if (centroid.base.length === 0) return []

  const c = new Float32Array(centroid.base)
  const n = l2norm(c)
  if (n === 0) return Array.from(c)

  const inv = 1 / n
  for (let i = 0; i < c.length; i++) c[i] *= inv

  // Convert back to number[] once at the end
  return Array.from(c)
}

export async function embedReason(reason: string) {
  if (!env.VOYAGE_API_KEY) return Result.ok<number[]>([])

  try {
    const cache = await getCache()
    const key = ISSUE_EMBEDDING_CACHE_KEY(
      hashContent(reason + ISSUE_EMBEDDING_MODEL),
    )

    try {
      const item = await cache.get(key)
      if (item) return Result.ok<number[]>(JSON.parse(item))
    } catch (_) {
      // Note: doing nothing
    }

    const voyage = await getVoyageClient()

    const response = await voyage.embed({
      input: reason,
      model: ISSUE_EMBEDDING_MODEL,
      inputType: 'document',
      truncation: false,
      outputDimension: 2048,
      outputDtype: 'float',
    })

    if (!response.data || response.data.length === 0) {
      return Result.error(
        new UnprocessableEntityError('Voyage did not return an embedding'),
      )
    }

    const data = response.data[0]
    if (!data || !data.embedding) {
      return Result.error(
        new UnprocessableEntityError('Voyage did not return an embedding'),
      )
    }

    try {
      const item = JSON.stringify(data.embedding)
      await cache.set(key, item)
    } catch (_) {
      // Note: doing nothing
    }

    return Result.ok(data.embedding)
  } catch (error) {
    return Result.error(error as Error)
  }
}

// Note: use only when searching by cosine similarity
export function normalizeEmbedding(embedding: number[]): number[] {
  if (embedding.length === 0) return []

  const v = new Float32Array(embedding.length)
  normalizeTo(v, embedding)

  // Convert back to number[] once at the end
  return Array.from(v)
}

export function isIssueActive(issue: Issue): boolean {
  return !issue.resolvedAt && !issue.ignoredAt && !issue.mergedAt
}
