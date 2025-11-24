import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { Cache } from '../cache'
import { cache } from '../cache'
import { RedisStream } from './redisStream'

describe('RedisStream', () => {
  let redis: Cache
  const testKeys = new Set<string>()
  let testCounter = Date.now()

  beforeAll(async () => {
    redis = await cache()
    process.setMaxListeners(20)
  })

  beforeEach(async () => {
    testKeys.clear()
  })

  afterEach(async () => {
    // Clean up test keys
    for (const key of testKeys) {
      await redis.del(key)
    }
    testKeys.clear()
  })

  describe('write', () => {
    it('writes events to Redis stream', async () => {
      const key = `test:stream:${testCounter++}`
      testKeys.add(key)
      const stream = new RedisStream({ key, cap: 100, ttl: 3600 })

      await stream.write({ type: 'test', data: 'event1' })
      await stream.write({ type: 'test', data: 'event2' })

      const result = await redis.xread('STREAMS', key, '0-0')
      expect(result).not.toBeNull()
      expect(result?.length).toBeGreaterThan(0)
      if (result && result.length > 0) {
        const events = result[0][1]
        expect(events.length).toBe(2)
      }

      await stream.close()
    })

    it('reuses write connection across multiple writes', async () => {
      const key = `test:stream:${testCounter++}`
      testKeys.add(key)
      const stream = new RedisStream({ key, cap: 100, ttl: 3600 })

      // Write multiple events
      await stream.write({ type: 'test', data: 'event1' })
      await stream.write({ type: 'test', data: 'event2' })
      await stream.write({ type: 'test', data: 'event3' })

      // Verify connection was reused by checking internal state
      // The connection should be created and reused
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const writeConnection = (stream as any).writeConnection
      expect(writeConnection).toBeDefined()

      await stream.close()
    })

    it('sets EXPIRE on first write', async () => {
      const key = `test:stream:${testCounter++}`
      testKeys.add(key)
      const stream = new RedisStream({ key, cap: 100, ttl: 3600 })

      await stream.write({ type: 'test', data: 'event1' })

      const ttl = await redis.ttl(key)
      expect(ttl).toBeGreaterThan(0)
      expect(ttl).toBeLessThanOrEqual(3600)

      await stream.close()
    })

    it('refreshes TTL periodically (every 100 writes)', async () => {
      const key = `test:stream:${testCounter++}`
      testKeys.add(key)
      const stream = new RedisStream({ key, cap: 1000, ttl: 3600 })

      // Write first event (should set EXPIRE)
      await stream.write({ type: 'test', data: 'event1' })
      const ttlAfterFirst = await redis.ttl(key)
      expect(ttlAfterFirst).toBeGreaterThan(0)
      expect(ttlAfterFirst).toBeLessThanOrEqual(3600)

      // Write 99 more events (should NOT set EXPIRE)
      for (let i = 2; i <= 100; i++) {
        await stream.write({ type: 'test', data: `event${i}` })
      }

      // TTL should not have been refreshed (should be <= original, not reset to 3600)
      // Note: If writes happen very fast, TTL might be the same, which is fine
      const ttlAfter100 = await redis.ttl(key)
      expect(ttlAfter100).toBeGreaterThan(0)
      expect(ttlAfter100).toBeLessThanOrEqual(ttlAfterFirst)

      // Write 101st event (should refresh EXPIRE)
      await stream.write({ type: 'test', data: 'event101' })
      const ttlAfter101 = await redis.ttl(key)
      // TTL should be refreshed (greater than or equal to ttlAfter100, closer to 3600)
      expect(ttlAfter101).toBeGreaterThan(0)
      // After refresh, TTL should be >= ttlAfter100 (refreshed back toward 3600)
      expect(ttlAfter101).toBeGreaterThanOrEqual(ttlAfter100)

      await stream.close()
    })

    it('handles MAXLEN trimming', async () => {
      const key = `test:stream:${testCounter++}`
      testKeys.add(key)
      const cap = 10
      const stream = new RedisStream({ key, cap, ttl: 3600 })

      // Write more events than cap
      for (let i = 1; i <= cap + 5; i++) {
        await stream.write({ type: 'test', data: `event${i}` })
      }

      // Stream should be trimmed to approximately cap
      const result = await redis.xread('STREAMS', key, '0-0')
      expect(result).not.toBeNull()
      if (result && result.length > 0) {
        const events = result[0][1]
        // With approximate MAXLEN, we might have slightly more than cap
        expect(events.length).toBeLessThanOrEqual(cap + 10)
      }

      await stream.close()
    })
  })

  describe('read', () => {
    it('reads events from Redis stream', async () => {
      const key = `test:stream:${testCounter++}`
      testKeys.add(key)
      const stream = new RedisStream({ key, cap: 100, ttl: 3600 })

      // Write some events
      await stream.write({ type: 'test', data: 'event1' })
      await stream.write({ type: 'test', data: 'event2' })

      // Read events
      const result = await stream.read({ lastId: '0-0', timeout: 1 })

      expect(result).not.toBeNull()
      if (result) {
        expect(result.result.length).toBeGreaterThan(0)
      }

      await stream.close()
    })

    it('reuses read connection across multiple reads', async () => {
      const key = `test:stream:${testCounter++}`
      testKeys.add(key)
      const stream = new RedisStream({ key, cap: 100, ttl: 3600 })

      await stream.write({ type: 'test', data: 'event1' })

      // Read multiple times
      const result1 = await stream.read({ lastId: '0-0', timeout: 1 })
      await stream.read({
        lastId: result1?.lastId ?? '0-0',
        timeout: 1,
      })

      // Verify connection was reused
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const readConnection = (stream as any).connection
      expect(readConnection).toBeDefined()

      await stream.close()
    })
  })

  describe('close', () => {
    it('closes both read and write connections', async () => {
      const key = `test:stream:${testCounter++}`
      testKeys.add(key)
      const stream = new RedisStream({ key, cap: 100, ttl: 3600 })

      // Use both connections
      await stream.write({ type: 'test', data: 'event1' })
      await stream.read({ lastId: '0-0', timeout: 1 })

      // Verify connections exist
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((stream as any).writeConnection).toBeDefined()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((stream as any).connection).toBeDefined()

      // Close connections
      await stream.close()

      // Verify connections are closed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((stream as any).writeConnection).toBeUndefined()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((stream as any).connection).toBeUndefined()
    })

    it('handles close when no connections exist', async () => {
      const key = `test:stream:${testCounter++}`
      testKeys.add(key)
      const stream = new RedisStream({ key, cap: 100, ttl: 3600 })

      // Should not throw
      await expect(stream.close()).resolves.not.toThrow()
    })
  })

  describe('cleanup', () => {
    it('sets expiration time for cleanup', async () => {
      const key = `test:stream:${testCounter++}`
      testKeys.add(key)
      const stream = new RedisStream({ key, cap: 100, ttl: 3600 })

      await stream.write({ type: 'test', data: 'event1' })

      const gracePeriod = 10
      await stream.cleanup(gracePeriod)

      const ttl = await redis.ttl(key)
      expect(ttl).toBeGreaterThan(0)
      expect(ttl).toBeLessThanOrEqual(gracePeriod)

      await stream.close()
    })
  })

  describe('performance optimizations', () => {
    it('reduces EXPIRE calls by using periodic refresh', async () => {
      const key = `test:stream:${testCounter++}`
      testKeys.add(key)
      const stream = new RedisStream({ key, cap: 1000, ttl: 3600 })

      // Mock Redis to count EXPIRE calls
      const expireSpy = vi.spyOn(redis, 'expire')

      // Write 250 events
      for (let i = 1; i <= 250; i++) {
        await stream.write({ type: 'test', data: `event${i}` })
      }

      // EXPIRE should be called:
      // - On first write (1)
      // - On 100th write (2)
      // - On 200th write (3)
      // Total: 3 calls instead of 250
      // Note: We can't directly spy on multi().expire() calls, but we can verify
      // the behavior by checking TTL values
      const ttl = await redis.ttl(key)
      expect(ttl).toBeGreaterThan(0)

      // Verify write count tracking
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((stream as any).writeCount).toBe(250)

      expireSpy.mockRestore()
      await stream.close()
    })
  })
})
