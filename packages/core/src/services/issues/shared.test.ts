import { describe, expect, it } from 'vitest'
import { EvaluationType } from '../../constants'
import {
  createCentroid,
  embedCentroid,
  mergeCentroids,
  normalizeEmbedding,
  updateCentroid,
} from './shared'

describe('createCentroid', () => {
  it('creates an empty centroid', () => {
    const centroid = createCentroid()

    expect(centroid.base).toEqual([])
    expect(centroid.weight).toBe(0)
  })
})

describe('updateCentroid', () => {
  const timestamp = new Date('2024-01-01T00:00:00Z')
  const resultTimestamp = new Date('2024-01-01T00:00:00Z')

  it('initializes empty centroid on first add', () => {
    const centroid = createCentroid()
    const result = {
      embedding: [1, 0, 0],
      type: EvaluationType.Human,
      createdAt: resultTimestamp,
    }

    const updated = updateCentroid(
      { ...centroid, updatedAt: timestamp },
      result,
      'add',
      timestamp,
    )

    expect(updated.base).toHaveLength(3)
    expect(updated.weight).toBeGreaterThan(0)
  })

  it('adds result to centroid with human weight', () => {
    const centroid = createCentroid()
    const result = {
      embedding: [1, 0, 0],
      type: EvaluationType.Human,
      createdAt: resultTimestamp,
    }

    const updated = updateCentroid(
      { ...centroid, updatedAt: timestamp },
      result,
      'add',
      timestamp,
    )

    // Human weight is 1.0, so weight should be 1.0
    expect(updated.weight).toBe(1.0)
  })

  it('adds result to centroid with rule weight', () => {
    const centroid = createCentroid()
    const result = {
      embedding: [1, 0, 0],
      type: EvaluationType.Rule,
      createdAt: resultTimestamp,
    }

    const updated = updateCentroid(
      { ...centroid, updatedAt: timestamp },
      result,
      'add',
      timestamp,
    )

    // Rule weight is 0.8
    expect(updated.weight).toBe(0.8)
  })

  it('adds result to centroid with llm weight', () => {
    const centroid = createCentroid()
    const result = {
      embedding: [1, 0, 0],
      type: EvaluationType.Llm,
      createdAt: resultTimestamp,
    }

    const updated = updateCentroid(
      { ...centroid, updatedAt: timestamp },
      result,
      'add',
      timestamp,
    )

    // LLM weight is 0.6
    expect(updated.weight).toBe(0.6)
  })

  it('accumulates multiple results', () => {
    let centroid = createCentroid()
    const result1 = {
      embedding: [1, 0, 0],
      type: EvaluationType.Human,
      createdAt: resultTimestamp,
    }
    const result2 = {
      embedding: [0, 1, 0],
      type: EvaluationType.Human,
      createdAt: resultTimestamp,
    }

    centroid = updateCentroid(
      { ...centroid, updatedAt: timestamp },
      result1,
      'add',
      timestamp,
    )
    centroid = updateCentroid(
      { ...centroid, updatedAt: timestamp },
      result2,
      'add',
      timestamp,
    )

    expect(centroid.weight).toBe(2.0)
    // Base should be sum of normalized embeddings
    expect(centroid.base[0]).toBeCloseTo(1.0)
    expect(centroid.base[1]).toBeCloseTo(1.0)
    expect(centroid.base[2]).toBeCloseTo(0.0)
  })

  it('removes result from centroid', () => {
    let centroid = createCentroid()
    const result = {
      embedding: [1, 0, 0],
      type: EvaluationType.Human,
      createdAt: resultTimestamp,
    }

    // Add then remove
    centroid = updateCentroid(
      { ...centroid, updatedAt: timestamp },
      result,
      'add',
      timestamp,
    )
    centroid = updateCentroid(
      { ...centroid, updatedAt: timestamp },
      result,
      'remove',
      timestamp,
    )

    expect(centroid.weight).toBeCloseTo(0)
    expect(centroid.base[0]).toBeCloseTo(0)
  })

  it('clamps weight to zero on removal', () => {
    let centroid = createCentroid()
    const result = {
      embedding: [1, 0, 0],
      type: EvaluationType.Human,
      createdAt: resultTimestamp,
    }

    // Remove from empty centroid
    centroid = updateCentroid(
      { ...centroid, updatedAt: timestamp },
      result,
      'remove',
      timestamp,
    )

    expect(centroid.weight).toBe(0) // Should not go negative
  })

  it('applies time decay to older results', () => {
    const centroid = createCentroid()
    const oldResultTimestamp = new Date('2023-12-18T00:00:00Z') // 14 days before timestamp
    const result = {
      embedding: [1, 0, 0],
      type: EvaluationType.Human,
      createdAt: oldResultTimestamp,
    }

    const updated = updateCentroid(
      { ...centroid, updatedAt: timestamp },
      result,
      'add',
      timestamp,
    )

    // With 14-day half-life, a result from 14 days ago should have weight 0.5
    expect(updated.weight).toBeCloseTo(0.5)
  })

  it('applies decay to existing centroid before updating', () => {
    let centroid = createCentroid()
    const result1 = {
      embedding: [1, 0, 0],
      type: EvaluationType.Human,
      createdAt: timestamp,
    }

    // Add first result
    centroid = updateCentroid(
      { ...centroid, updatedAt: timestamp },
      result1,
      'add',
      timestamp,
    )

    expect(centroid.weight).toBe(1.0)

    // Update 14 days later
    const futureTimestamp = new Date('2024-01-15T00:00:00Z')
    const result2 = {
      embedding: [0, 1, 0],
      type: EvaluationType.Human,
      createdAt: futureTimestamp,
    }

    centroid = updateCentroid(
      { ...centroid, updatedAt: timestamp },
      result2,
      'add',
      futureTimestamp,
    )

    // Weight should be 0.5 (decayed old) + 1.0 (new) = 1.5
    expect(centroid.weight).toBeCloseTo(1.5)
  })

  it('throws error on dimension mismatch', () => {
    let centroid = createCentroid()
    const result1 = {
      embedding: [1, 0, 0],
      type: EvaluationType.Human,
      createdAt: timestamp,
    }

    centroid = updateCentroid(
      { ...centroid, updatedAt: timestamp },
      result1,
      'add',
      timestamp,
    )

    const result2 = {
      embedding: [1, 0], // Different dimension
      type: EvaluationType.Human,
      createdAt: timestamp,
    }

    expect(() =>
      updateCentroid(
        { ...centroid, updatedAt: timestamp },
        result2,
        'add',
        timestamp,
      ),
    ).toThrow(/Dimension mismatch/)
  })

  it('normalizes result embeddings before adding', () => {
    const centroid = createCentroid()
    const result = {
      embedding: [3, 4], // Not normalized (length = 5)
      type: EvaluationType.Human,
      createdAt: timestamp,
    }

    const updated = updateCentroid(
      { ...centroid, updatedAt: timestamp },
      result,
      'add',
      timestamp,
    )

    // After normalization, [3, 4] becomes [0.6, 0.8]
    expect(updated.base[0]).toBeCloseTo(0.6)
    expect(updated.base[1]).toBeCloseTo(0.8)
  })
})

describe('mergeCentroids', () => {
  const timestamp = new Date('2024-01-01T00:00:00Z')

  it('merges two centroids', () => {
    const centroid1 = {
      base: [1, 0, 0],
      weight: 1.0,
      updatedAt: timestamp,
    }
    const centroid2 = {
      base: [0, 1, 0],
      weight: 1.0,
      updatedAt: timestamp,
    }

    const merged = mergeCentroids([centroid1, centroid2], timestamp)

    expect(merged.weight).toBe(2.0)
    expect(merged.base[0]).toBeCloseTo(1.0)
    expect(merged.base[1]).toBeCloseTo(1.0)
    expect(merged.base[2]).toBeCloseTo(0.0)
  })

  it('merges multiple centroids', () => {
    const centroid1 = {
      base: [1, 0, 0],
      weight: 1.0,
      updatedAt: timestamp,
    }
    const centroid2 = {
      base: [0, 1, 0],
      weight: 0.5,
      updatedAt: timestamp,
    }
    const centroid3 = {
      base: [0, 0, 1],
      weight: 0.8,
      updatedAt: timestamp,
    }

    const merged = mergeCentroids([centroid1, centroid2, centroid3], timestamp)

    // Base vectors are summed directly (they're already weighted sums)
    expect(merged.weight).toBeCloseTo(2.3)
    expect(merged.base[0]).toBeCloseTo(1.0)
    expect(merged.base[1]).toBeCloseTo(1.0)
    expect(merged.base[2]).toBeCloseTo(1.0)
  })

  it('returns single centroid unchanged', () => {
    const centroid = {
      base: [1, 2, 3],
      weight: 5.0,
      updatedAt: timestamp,
    }

    const merged = mergeCentroids([centroid], timestamp)

    expect(merged.weight).toBe(5.0)
    expect(merged.base).toEqual([1, 2, 3])
  })

  it('applies decay to centroids before merging', () => {
    const oldTimestamp = new Date('2023-12-18T00:00:00Z') // 14 days before
    const centroid1 = {
      base: [1, 0, 0],
      weight: 1.0,
      updatedAt: oldTimestamp,
    }
    const centroid2 = {
      base: [0, 1, 0],
      weight: 1.0,
      updatedAt: timestamp,
    }

    const merged = mergeCentroids([centroid1, centroid2], timestamp)

    // First centroid should be decayed by 0.5, second should not
    expect(merged.weight).toBeCloseTo(1.5)
    expect(merged.base[0]).toBeCloseTo(0.5) // Decayed
    expect(merged.base[1]).toBeCloseTo(1.0) // Not decayed
  })

  it('throws error on dimension mismatch', () => {
    const centroid1 = {
      base: [1, 0, 0],
      weight: 1.0,
      updatedAt: timestamp,
    }
    const centroid2 = {
      base: [0, 1], // Different dimension
      weight: 1.0,
      updatedAt: timestamp,
    }

    expect(() => mergeCentroids([centroid1, centroid2], timestamp)).toThrow(
      /Dimension mismatch/,
    )
  })

  it('throws error on empty array', () => {
    expect(() => mergeCentroids([], timestamp)).toThrow(
      /Cannot merge empty centroids/,
    )
  })

  it('merges centroids with different weights', () => {
    const centroid1 = {
      base: [1, 0],
      weight: 2.0,
      updatedAt: timestamp,
    }
    const centroid2 = {
      base: [0, 1],
      weight: 0.5,
      updatedAt: timestamp,
    }

    const merged = mergeCentroids([centroid1, centroid2], timestamp)

    // Base vectors are summed directly (they're already weighted sums)
    expect(merged.weight).toBeCloseTo(2.5)
    expect(merged.base[0]).toBeCloseTo(1.0)
    expect(merged.base[1]).toBeCloseTo(1.0)
  })
})

describe('embedCentroid', () => {
  it('returns normalized vector from centroid', () => {
    const centroid = {
      base: [3, 4],
      weight: 1.0,
    }

    const embedded = embedCentroid(centroid)

    expect(embedded).toHaveLength(2)
    expect(embedded[0]).toBeCloseTo(0.6)
    expect(embedded[1]).toBeCloseTo(0.8)

    // Check it's unit length
    const length = Math.sqrt(embedded[0] ** 2 + embedded[1] ** 2)
    expect(length).toBeCloseTo(1.0)
  })

  it('handles empty centroid', () => {
    const centroid = createCentroid()
    const embedded = embedCentroid(centroid)

    expect(embedded).toEqual([])
  })

  it('handles zero vector centroid', () => {
    const centroid = {
      base: [0, 0, 0],
      weight: 0,
    }

    const embedded = embedCentroid(centroid)

    expect(embedded).toEqual([0, 0, 0])
  })
})

describe('normalizeEmbedding', () => {
  it('normalizes a vector to unit length', () => {
    const embedding = [3, 4] // length = 5
    const normalized = normalizeEmbedding(embedding)

    expect(normalized).toHaveLength(2)
    expect(normalized[0]).toBeCloseTo(0.6)
    expect(normalized[1]).toBeCloseTo(0.8)

    // Check it's unit length
    const length = Math.sqrt(normalized[0] ** 2 + normalized[1] ** 2)
    expect(length).toBeCloseTo(1.0)
  })

  it('handles zero vectors', () => {
    const embedding = [0, 0, 0]
    const normalized = normalizeEmbedding(embedding)

    expect(normalized).toEqual([0, 0, 0])
  })

  it('handles empty arrays', () => {
    const embedding: number[] = []
    const normalized = normalizeEmbedding(embedding)

    expect(normalized).toEqual([])
  })

  it('normalizes multi-dimensional vectors', () => {
    const embedding = [1, 2, 3, 4]
    const normalized = normalizeEmbedding(embedding)

    // Check it's unit length
    const length = Math.sqrt(normalized.reduce((sum, val) => sum + val ** 2, 0))
    expect(length).toBeCloseTo(1.0)
  })
})

describe('integration', () => {
  const baseTimestamp = new Date('2024-01-01T00:00:00Z')

  it('creates, updates, and embeds a centroid', () => {
    let centroid = createCentroid()

    // Add first result
    centroid = updateCentroid(
      { ...centroid, updatedAt: baseTimestamp },
      {
        embedding: [1, 0, 0],
        type: EvaluationType.Human,
        createdAt: baseTimestamp,
      },
      'add',
      baseTimestamp,
    )

    // Add second result
    centroid = updateCentroid(
      { ...centroid, updatedAt: baseTimestamp },
      {
        embedding: [0, 1, 0],
        type: EvaluationType.Human,
        createdAt: baseTimestamp,
      },
      'add',
      baseTimestamp,
    )

    // Embed for DB storage
    const embedded = embedCentroid(centroid)

    // Should be normalized
    const length = Math.sqrt(embedded.reduce((sum, val) => sum + val ** 2, 0))
    expect(length).toBeCloseTo(1.0)

    // Should be roughly [0.707, 0.707, 0]
    expect(embedded[0]).toBeCloseTo(0.7071, 3)
    expect(embedded[1]).toBeCloseTo(0.7071, 3)
    expect(embedded[2]).toBeCloseTo(0, 3)
  })

  it('creates multiple centroids and merges them', () => {
    // Create first cluster
    let centroid1 = createCentroid()
    centroid1 = updateCentroid(
      { ...centroid1, updatedAt: baseTimestamp },
      {
        embedding: [1, 0, 0],
        type: EvaluationType.Human,
        createdAt: baseTimestamp,
      },
      'add',
      baseTimestamp,
    )

    // Create second cluster
    let centroid2 = createCentroid()
    centroid2 = updateCentroid(
      { ...centroid2, updatedAt: baseTimestamp },
      {
        embedding: [0, 1, 0],
        type: EvaluationType.Human,
        createdAt: baseTimestamp,
      },
      'add',
      baseTimestamp,
    )

    // Merge clusters
    const merged = mergeCentroids(
      [
        { ...centroid1, updatedAt: baseTimestamp },
        { ...centroid2, updatedAt: baseTimestamp },
      ],
      baseTimestamp,
    )

    expect(merged.weight).toBe(2.0)

    // Embed merged centroid
    const embedded = embedCentroid(merged)
    const length = Math.sqrt(embedded.reduce((sum, val) => sum + val ** 2, 0))
    expect(length).toBeCloseTo(1.0)
  })

  it('handles add and remove operations maintaining consistency', () => {
    let centroid = createCentroid()
    const result1 = {
      embedding: [1, 0, 0],
      type: EvaluationType.Human,
      createdAt: baseTimestamp,
    }
    const result2 = {
      embedding: [0, 1, 0],
      type: EvaluationType.Human,
      createdAt: baseTimestamp,
    }

    // Add two results
    centroid = updateCentroid(
      { ...centroid, updatedAt: baseTimestamp },
      result1,
      'add',
      baseTimestamp,
    )
    centroid = updateCentroid(
      { ...centroid, updatedAt: baseTimestamp },
      result2,
      'add',
      baseTimestamp,
    )

    expect(centroid.weight).toBe(2.0)

    // Remove first result
    centroid = updateCentroid(
      { ...centroid, updatedAt: baseTimestamp },
      result1,
      'remove',
      baseTimestamp,
    )

    expect(centroid.weight).toBeCloseTo(1.0)
    // Should be back to just result2
    expect(centroid.base[0]).toBeCloseTo(0)
    expect(centroid.base[1]).toBeCloseTo(1.0)
  })

  it('handles time decay across multiple operations', () => {
    let centroid = createCentroid()
    const t0 = new Date('2024-01-01T00:00:00Z')
    const t1 = new Date('2024-01-15T00:00:00Z') // +14 days
    const t2 = new Date('2024-01-29T00:00:00Z') // +28 days

    // Add result at t0
    centroid = updateCentroid(
      { ...centroid, updatedAt: t0 },
      {
        embedding: [1, 0, 0],
        type: EvaluationType.Human,
        createdAt: t0,
      },
      'add',
      t0,
    )

    expect(centroid.weight).toBe(1.0)

    // Add result at t1 (14 days later)
    centroid = updateCentroid(
      { ...centroid, updatedAt: t0 },
      {
        embedding: [0, 1, 0],
        type: EvaluationType.Human,
        createdAt: t1,
      },
      'add',
      t1,
    )

    // Old weight decayed to 0.5, new weight is 1.0
    expect(centroid.weight).toBeCloseTo(1.5)

    // Add result at t2 (28 days later)
    centroid = updateCentroid(
      { ...centroid, updatedAt: t1 },
      {
        embedding: [0, 0, 1],
        type: EvaluationType.Human,
        createdAt: t2,
      },
      'add',
      t2,
    )

    // Old weight 1.5 decayed to 0.75, new weight is 1.0
    expect(centroid.weight).toBeCloseTo(1.75)
  })
})
