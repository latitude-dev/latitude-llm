import {
  describe,
  expect,
  it,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
  afterAll,
} from 'vitest'
import { withCacheLock, cache } from './index'
import type { Cache } from './index'

describe('withCacheLock', () => {
  let redis: Cache

  beforeAll(async () => {
    redis = await cache()
  })

  beforeEach(async () => {
    // Clear any locks from previous tests
    const keys = await redis.keys('lock:*')
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  })

  afterEach(async () => {
    // Clean up any remaining locks
    const keys = await redis.keys('lock:*')
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  })

  afterAll(async () => {
    // Close Redis connection to prevent memory leaks
    if (redis) {
      await redis.quit()
    }
  })

  describe('basic lock behavior', () => {
    it('acquires lock and executes callback', async () => {
      const callback = vi.fn().mockResolvedValue('result')

      const result = await withCacheLock({
        lockKey: 'test-key',
        callbackFn: callback,
        timeout: 5000,
      })

      expect(result).toBe('result')
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(redis)
    })

    it('releases lock after callback completes', async () => {
      await withCacheLock({
        lockKey: 'test-key',
        callbackFn: async () => 'result',
        timeout: 5000,
      })

      // Lock should be released - second acquisition should be immediate
      const startTime = Date.now()
      await withCacheLock({
        lockKey: 'test-key',
        callbackFn: async () => 'result2',
        timeout: 5000,
      })
      const elapsed = Date.now() - startTime

      // Should acquire immediately (< 100ms)
      expect(elapsed).toBeLessThan(100)
    })

    it('releases lock even if callback throws', async () => {
      const callback = vi.fn().mockRejectedValue(new Error('Callback error'))

      await expect(
        withCacheLock({
          lockKey: 'test-key',
          callbackFn: callback,
          timeout: 5000,
        }),
      ).rejects.toThrow('Callback error')

      // Lock should be released
      const startTime = Date.now()
      await withCacheLock({
        lockKey: 'test-key',
        callbackFn: async () => 'result',
        timeout: 5000,
      })
      const elapsed = Date.now() - startTime

      expect(elapsed).toBeLessThan(100)
    })
  })

  describe('concurrent access', () => {
    it('prevents concurrent execution of callbacks', async () => {
      const executionOrder: number[] = []

      const callback1 = async () => {
        executionOrder.push(1)
        await new Promise((resolve) => setTimeout(resolve, 100))
        executionOrder.push(2)
        return 'result1'
      }

      const callback2 = async () => {
        executionOrder.push(3)
        await new Promise((resolve) => setTimeout(resolve, 50))
        executionOrder.push(4)
        return 'result2'
      }

      // Start both operations concurrently
      const [result1, result2] = await Promise.all([
        withCacheLock({
          lockKey: 'test-key',
          callbackFn: callback1,
          timeout: 5000,
        }),
        withCacheLock({
          lockKey: 'test-key',
          callbackFn: callback2,
          timeout: 5000,
        }),
      ])

      expect(result1).toBe('result1')
      expect(result2).toBe('result2')

      // Second callback should wait for first to complete
      // Expected order: [1, 2, 3, 4] (sequential)
      // NOT [1, 3, 2, 4] (interleaved)
      expect(executionOrder).toEqual([1, 2, 3, 4])
    })

    it('handles multiple concurrent lock attempts', async () => {
      const concurrentCount = 10
      const executionOrder: number[] = []

      const createCallback = (id: number) => async () => {
        executionOrder.push(id)
        await new Promise((resolve) => setTimeout(resolve, 10))
        return id
      }

      const promises = Array.from({ length: concurrentCount }, (_, i) =>
        withCacheLock({
          lockKey: 'test-key',
          callbackFn: createCallback(i),
          timeout: 5000,
        }),
      )

      const results = await Promise.all(promises)

      // All callbacks should complete
      expect(results).toHaveLength(concurrentCount)
      expect(executionOrder).toHaveLength(concurrentCount)

      // No duplicates - each callback ran exactly once
      expect(new Set(executionOrder).size).toBe(concurrentCount)
    })
  })

  describe('lock timeout', () => {
    it('throws error if lock cannot be acquired within timeout', async () => {
      // Acquire lock and hold it
      const holdLock = withCacheLock({
        lockKey: 'test-key',
        callbackFn: async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          return 'holder'
        },
        timeout: 5000,
      })

      // Try to acquire same lock with short timeout
      await expect(
        withCacheLock({
          lockKey: 'test-key',
          callbackFn: async () => 'contender',
          timeout: 100,
          maxRetries: 1,
        }),
      ).rejects.toThrow('Failed to acquire lock')

      // Wait for first lock to release
      await holdLock
    })

    it('successfully acquires lock after timeout if lock is released', async () => {
      // Acquire lock briefly
      const promise1 = withCacheLock({
        lockKey: 'test-key',
        callbackFn: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return 'first'
        },
        timeout: 5000,
      })

      // Wait a bit then try to acquire
      await new Promise((resolve) => setTimeout(resolve, 50))

      const promise2 = withCacheLock({
        lockKey: 'test-key',
        callbackFn: async () => 'second',
        timeout: 5000,
      })

      const [result1, result2] = await Promise.all([promise1, promise2])

      expect(result1).toBe('first')
      expect(result2).toBe('second')
    })
  })

  describe('lock key isolation', () => {
    it('different lock keys do not interfere', async () => {
      const executionOrder: string[] = []

      const callback1 = async () => {
        executionOrder.push('key1-start')
        await new Promise((resolve) => setTimeout(resolve, 100))
        executionOrder.push('key1-end')
        return 'result1'
      }

      const callback2 = async () => {
        executionOrder.push('key2-start')
        await new Promise((resolve) => setTimeout(resolve, 50))
        executionOrder.push('key2-end')
        return 'result2'
      }

      // Start both with DIFFERENT keys
      const [result1, result2] = await Promise.all([
        withCacheLock({
          lockKey: 'key1',
          callbackFn: callback1,
          timeout: 5000,
        }),
        withCacheLock({
          lockKey: 'key2',
          callbackFn: callback2,
          timeout: 5000,
        }),
      ])

      expect(result1).toBe('result1')
      expect(result2).toBe('result2')

      // Should execute concurrently (interleaved)
      expect(executionOrder).toEqual([
        'key1-start',
        'key2-start',
        'key2-end',
        'key1-end',
      ])
    })
  })

  describe('stress test - high contention', () => {
    it('handles 20 concurrent operations on same key', async () => {
      const concurrentCount = 20
      let counter = 0

      const callback = async () => {
        // Simulate race condition without lock
        const current = counter
        await new Promise((resolve) => setTimeout(resolve, 1))
        counter = current + 1
        return counter
      }

      const promises = Array.from({ length: concurrentCount }, () =>
        withCacheLock({
          lockKey: 'test-key',
          callbackFn: callback,
          timeout: 5000,
        }),
      )

      const results = await Promise.all(promises)

      // Counter should be exactly 20 (no race condition)
      expect(counter).toBe(concurrentCount)

      // All results should be unique
      expect(new Set(results).size).toBe(concurrentCount)
    }, 10000)

    it('completes 20 operations within reasonable time', async () => {
      const concurrentCount = 20
      const operationDuration = 50 // Each operation takes 50ms

      const callback = async () => {
        await new Promise((resolve) => setTimeout(resolve, operationDuration))
        return Date.now()
      }

      const startTime = Date.now()

      const promises = Array.from({ length: concurrentCount }, () =>
        withCacheLock({
          lockKey: 'test-key',
          callbackFn: callback,
          timeout: 5000,
        }),
      )

      await Promise.all(promises)

      const totalTime = Date.now() - startTime

      // Should complete in roughly: 20 operations * 50ms = 1000ms
      // Add some buffer for overhead
      expect(totalTime).toBeGreaterThan(950) // At least sequential time
      expect(totalTime).toBeLessThan(1500) // But not too much overhead
    }, 10000)
  })
})
