import { describe, expect, it } from "vitest"
import { TAXONOMY_CENTROID_HALF_LIFE_SECONDS, TAXONOMY_EMBEDDING_DIMENSIONS } from "./constants.ts"
import type { TaxonomyCentroid } from "./entities/cluster.ts"
import {
  agglomerativeCluster,
  clamp,
  cosineSimilarity,
  cosineSimilarityNormalized,
  createTaxonomyCentroid,
  farthestPointSample,
  meanNormalized,
  normalizeTaxonomyCentroid,
  normalizeTaxonomyEmbedding,
  singleLinkageClusters,
  softmax,
  updateTaxonomyCentroid,
} from "./helpers.ts"

const makeVector = (dimensions: number, entries: ReadonlyArray<readonly [number, number]>): number[] => {
  const vector = new Array<number>(dimensions).fill(0)
  for (const [index, value] of entries) {
    vector[index] = value
  }
  return vector
}

const normalize = (v: readonly number[]): number[] => normalizeTaxonomyEmbedding(v)

describe("taxonomy centroid helpers", () => {
  it("creates a centroid with the configured dimensions and weight scheme", () => {
    const centroid = createTaxonomyCentroid()
    expect(centroid.base).toHaveLength(TAXONOMY_EMBEDDING_DIMENSIONS)
    expect(centroid.mass).toBe(0)
    expect(centroid.decay).toBe(TAXONOMY_CENTROID_HALF_LIFE_SECONDS)
    expect(centroid.weights).toEqual({ default: 1.0 })
  })

  it("adds an observation contribution that points the centroid at the observation direction", () => {
    const baseTimestamp = new Date("2026-05-01T00:00:00Z")
    const centroid: TaxonomyCentroid & { clusteredAt: Date } = {
      ...createTaxonomyCentroid(),
      clusteredAt: baseTimestamp,
    }
    const embedding = makeVector(TAXONOMY_EMBEDDING_DIMENSIONS, [
      [0, 1],
      [1, 0],
    ])
    const updated = updateTaxonomyCentroid({
      centroid,
      embedding,
      weight: 1.0,
      timestamp: baseTimestamp,
      operation: "add",
      previousClusteredAt: baseTimestamp,
    })
    expect(updated.mass).toBeGreaterThan(0)
    const normalized = normalizeTaxonomyCentroid(updated)
    expect(normalized[0]).toBeCloseTo(1, 5)
    expect(normalized[1]).toBeCloseTo(0, 5)
  })

  it("decays mass over time when subsequent observations land later", () => {
    const start = new Date("2026-05-01T00:00:00Z")
    const centroid: TaxonomyCentroid & { clusteredAt: Date } = {
      ...createTaxonomyCentroid(),
      clusteredAt: start,
    }
    const embedding = makeVector(TAXONOMY_EMBEDDING_DIMENSIONS, [[0, 1]])
    const afterFirst = updateTaxonomyCentroid({
      centroid,
      embedding,
      weight: 1.0,
      timestamp: start,
      operation: "add",
      previousClusteredAt: start,
    })
    expect(afterFirst.mass).toBeCloseTo(1, 5)

    // One full half-life later, prior mass should halve before the new add.
    const oneHalfLife = new Date(start.getTime() + TAXONOMY_CENTROID_HALF_LIFE_SECONDS * 1000)
    const afterSecond = updateTaxonomyCentroid({
      centroid: afterFirst,
      embedding,
      weight: 1.0,
      timestamp: oneHalfLife,
      operation: "add",
      previousClusteredAt: afterFirst.clusteredAt,
    })
    // 0.5 (decayed) + 1.0 (fresh) ≈ 1.5
    expect(afterSecond.mass).toBeCloseTo(1.5, 5)
  })

  it("zeroes out the centroid when remove would drive mass non-positive", () => {
    const start = new Date("2026-05-01T00:00:00Z")
    const centroid: TaxonomyCentroid & { clusteredAt: Date } = {
      ...createTaxonomyCentroid(),
      clusteredAt: start,
    }
    const embedding = makeVector(TAXONOMY_EMBEDDING_DIMENSIONS, [[5, 1]])
    const added = updateTaxonomyCentroid({
      centroid,
      embedding,
      weight: 1.0,
      timestamp: start,
      operation: "add",
      previousClusteredAt: start,
    })
    const removed = updateTaxonomyCentroid({
      centroid: added,
      embedding,
      weight: 1.0,
      timestamp: start,
      operation: "remove",
      previousClusteredAt: added.clusteredAt,
    })
    expect(removed.mass).toBe(0)
    expect(removed.base.every((v) => v === 0)).toBe(true)
  })

  it("fails fast on embedding dimension mismatches", () => {
    const start = new Date("2026-05-01T00:00:00Z")
    const centroid: TaxonomyCentroid & { clusteredAt: Date } = {
      ...createTaxonomyCentroid(),
      clusteredAt: start,
    }
    expect(() =>
      updateTaxonomyCentroid({
        centroid,
        embedding: [1, 0],
        weight: 1.0,
        timestamp: start,
        operation: "add",
        previousClusteredAt: start,
      }),
    ).toThrow(/Dimension mismatch/)
  })
})

describe("cosine + softmax", () => {
  it("returns 1 for identical unit vectors and 0 for orthogonal ones", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 5)
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5)
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5)
  })

  it("treats already-normalized vectors with the dot product as cosine", () => {
    const a = normalize([3, 4])
    const b = normalize([4, 3])
    expect(cosineSimilarityNormalized(a, b)).toBeCloseTo(cosineSimilarity(a, b), 5)
  })

  it("returns 0 for empty or mismatched-length inputs", () => {
    expect(cosineSimilarity([], [1])).toBe(0)
    expect(cosineSimilarityNormalized([1, 0], [1, 0, 0])).toBe(0)
  })

  it("softmax sharpens with smaller temperatures", () => {
    const sharp = softmax([0.9, 0.8, 0.1], 0.05)
    const flat = softmax([0.9, 0.8, 0.1], 1)
    expect(sharp[0]).toBeGreaterThan(flat[0] ?? 0)
    const sum = (sharp[0] ?? 0) + (sharp[1] ?? 0) + (sharp[2] ?? 0)
    expect(sum).toBeCloseTo(1, 5)
  })

  it("softmax returns an empty array on empty input", () => {
    expect(softmax([], 0.1)).toEqual([])
  })
})

describe("singleLinkageClusters", () => {
  it("groups embeddings that share a high-cosine edge into one component", () => {
    const points = [
      normalize([1, 0, 0]),
      normalize([0.99, 0.05, 0]),
      normalize([0.98, -0.05, 0]),
      normalize([0, 1, 0]), // far cluster
      normalize([0.02, 0.99, 0]),
      normalize([0.03, 0.97, 0]),
    ]
    const candidates = singleLinkageClusters({
      embeddings: points,
      connectivityThreshold: 0.95,
      minMembers: 2,
      maxDiameter: 0.5,
    })
    expect(candidates).toHaveLength(2)
    const memberSets = candidates.map((c) => c.members.slice().sort((a, b) => a - b))
    expect(memberSets).toContainEqual([0, 1, 2])
    expect(memberSets).toContainEqual([3, 4, 5])
  })

  it("rejects candidates below the min-members floor", () => {
    const points = [normalize([1, 0]), normalize([0.99, 0.01])]
    const candidates = singleLinkageClusters({
      embeddings: points,
      connectivityThreshold: 0.9,
      minMembers: 3,
      maxDiameter: 0.5,
    })
    expect(candidates).toEqual([])
  })

  it("rejects candidates whose diameter exceeds the cap (chain cut)", () => {
    // A chain a-b-c where a..c are far apart but each adjacent pair is close.
    const points = [normalize([1, 0]), normalize([0.7, 0.7]), normalize([0, 1])]
    const candidates = singleLinkageClusters({
      embeddings: points,
      connectivityThreshold: 0.65,
      minMembers: 2,
      maxDiameter: 0.2, // a..c cosine distance is ~1; should be rejected
    })
    expect(candidates).toEqual([])
  })

  it("returns no candidates for empty input", () => {
    expect(
      singleLinkageClusters({ embeddings: [], connectivityThreshold: 0.8, minMembers: 1, maxDiameter: 0.5 }),
    ).toEqual([])
  })
})

describe("agglomerativeCluster", () => {
  it("rolls clearly-separable input into the requested k components", () => {
    const vectors = [
      normalize([1, 0, 0]),
      normalize([0.95, 0.1, 0]),
      normalize([0, 1, 0]),
      normalize([0.05, 0.99, 0]),
      normalize([0, 0, 1]),
      normalize([0.05, 0.05, 0.97]),
    ]
    const { assignments, clusters } = agglomerativeCluster({ vectors, k: 3 })
    expect(clusters).toHaveLength(3)
    expect(assignments[0]).toBe(assignments[1])
    expect(assignments[2]).toBe(assignments[3])
    expect(assignments[4]).toBe(assignments[5])
    expect(new Set(assignments).size).toBe(3)
  })

  it("returns one cluster per input when k >= n", () => {
    const vectors = [normalize([1, 0]), normalize([0, 1])]
    const { clusters } = agglomerativeCluster({ vectors, k: 5 })
    expect(clusters).toHaveLength(2)
  })

  it("handles empty input", () => {
    expect(agglomerativeCluster({ vectors: [], k: 3 })).toEqual({ assignments: [], clusters: [] })
  })
})

describe("farthestPointSample", () => {
  it("returns all indices when the budget exceeds the input size", () => {
    const vectors = [normalize([1, 0]), normalize([0, 1])]
    expect(farthestPointSample(vectors, 5)).toEqual([0, 1])
  })

  it("returns the requested number of samples without duplicates", () => {
    const vectors = [
      normalize([1, 0, 0]),
      normalize([0.95, 0.1, 0]),
      normalize([0, 1, 0]),
      normalize([0.05, 0.99, 0]),
      normalize([0, 0, 1]),
    ]
    const sample = farthestPointSample(vectors, 3)
    expect(sample).toHaveLength(3)
    expect(new Set(sample).size).toBe(3)
  })

  it("returns an empty array for empty input or zero budget", () => {
    expect(farthestPointSample([], 3)).toEqual([])
    expect(farthestPointSample([normalize([1, 0])], 0)).toEqual([])
  })
})

describe("clamp + meanNormalized", () => {
  it("clamps below min, above max, and within range", () => {
    expect(clamp(5, 1, 10)).toBe(5)
    expect(clamp(-1, 1, 10)).toBe(1)
    expect(clamp(11, 1, 10)).toBe(10)
  })

  it("meanNormalized returns a unit vector pointing at the input mean", () => {
    const result = meanNormalized([normalize([1, 0]), normalize([0, 1])])
    expect(result[0]).toBeCloseTo(Math.SQRT1_2, 5)
    expect(result[1]).toBeCloseTo(Math.SQRT1_2, 5)
  })

  it("meanNormalized handles empty input", () => {
    expect(meanNormalized([])).toEqual([])
  })
})
