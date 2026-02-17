import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProgressTracker } from './progressTracker'

describe('ProgressTracker', () => {
  let tracker: ProgressTracker
  let batchId: string

  beforeEach(() => {
    batchId = `test-batch-${Date.now()}-${Math.random().toString(36).slice(2)}`
    tracker = new ProgressTracker(batchId)
  })

  afterEach(async () => {
    await tracker.cleanup().catch(() => {})
    await tracker.disconnect().catch(() => {})
  })

  describe('initializeProgress', () => {
    it('stores run UUIDs when initializing progress', async () => {
      const uuids = ['uuid-1', 'uuid-2', 'uuid-3']

      await tracker.initializeProgress(uuids, 2)

      const storedUuids = await tracker.getRunUuids()
      expect(storedUuids.sort()).toEqual(uuids.sort())
    })

    it('handles empty uuids array', async () => {
      await tracker.initializeProgress([], 2)

      const storedUuids = await tracker.getRunUuids()
      expect(storedUuids).toEqual([])
    })

    it('sets totalRows and evaluationsPerRow correctly', async () => {
      const uuids = ['uuid-1', 'uuid-2']

      await tracker.initializeProgress(uuids, 3)

      const progress = await tracker.getProgress()
      expect(progress.total).toBe(2)
    })
  })

  describe('getRunUuids', () => {
    it('returns stored run UUIDs', async () => {
      const uuids = ['uuid-1', 'uuid-2', 'uuid-3']
      await tracker.initializeProgress(uuids, 1)

      const result = await tracker.getRunUuids()

      expect(result.sort()).toEqual(uuids.sort())
    })

    it('returns empty array when no UUIDs stored', async () => {
      const result = await tracker.getRunUuids()

      expect(result).toEqual([])
    })
  })

  describe('cleanup', () => {
    it('removes all keys from Redis', async () => {
      const uuids = ['uuid-1', 'uuid-2']
      await tracker.initializeProgress(uuids, 1)

      await tracker.cleanup()

      const newTracker = new ProgressTracker(batchId)
      try {
        const progress = await newTracker.getProgress()
        expect(progress.total).toBe(0)

        const storedUuids = await newTracker.getRunUuids()
        expect(storedUuids).toEqual([])
      } finally {
        await newTracker.disconnect().catch(() => {})
      }
    })
  })

  describe('getProgress', () => {
    it('returns initialized progress data', async () => {
      await tracker.initializeProgress(['uuid-1', 'uuid-2', 'uuid-3'], 2)

      const progress = await tracker.getProgress()

      expect(progress).toEqual({
        total: 3,
        completed: 0,
        passed: 0,
        failed: 0,
        errors: 0,
        totalScore: 0,
        documentRunsCompleted: 0,
      })
    })
  })

  describe('documentRunFinished', () => {
    it('increments completed count when row is done', async () => {
      await tracker.initializeProgress(['uuid-1'], 0)

      await tracker.documentRunFinished('uuid-1', true)

      const progress = await tracker.getProgress()
      expect(progress.completed).toBe(1)
      expect(progress.documentRunsCompleted).toBe(1)
    })

    it('marks run and evaluations as errors when document run fails', async () => {
      await tracker.initializeProgress(['uuid-1'], 2)

      await tracker.documentRunFinished('uuid-1', false)

      const progress = await tracker.getProgress()
      expect(progress.errors).toBe(3)
      expect(progress.completed).toBe(1)
      expect(progress.documentRunsCompleted).toBe(1)
    })

    it('marks run as error when document run fails with no evaluations', async () => {
      await tracker.initializeProgress(['uuid-1'], 0)

      await tracker.documentRunFinished('uuid-1', false)

      const progress = await tracker.getProgress()
      expect(progress.errors).toBe(1)
      expect(progress.completed).toBe(1)
      expect(progress.documentRunsCompleted).toBe(1)
    })
  })

  describe('evaluationFinished', () => {
    it('increments passed count for passing evaluation', async () => {
      await tracker.initializeProgress(['uuid-1'], 1)
      await tracker.documentRunFinished('uuid-1', true)

      await tracker.evaluationFinished('uuid-1', { passed: true, score: 100 })

      const progress = await tracker.getProgress()
      expect(progress.passed).toBe(1)
      expect(progress.totalScore).toBe(100)
    })

    it('increments failed count for failing evaluation', async () => {
      await tracker.initializeProgress(['uuid-1'], 1)
      await tracker.documentRunFinished('uuid-1', true)

      await tracker.evaluationFinished('uuid-1', { passed: false, score: 0 })

      const progress = await tracker.getProgress()
      expect(progress.failed).toBe(1)
    })
  })
})
