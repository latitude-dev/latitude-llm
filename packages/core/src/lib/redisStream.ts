import { env } from '@latitude-data/env'
import Redis from 'ioredis'
import { cache } from '../cache'

/**
 * Abstraction for reading and writing to Redis streams with automatic
 * capacity limits and expiration handling.
 */
export class RedisStream {
  private key: string
  private cap: number
  private ttl: number
  private connection?: Redis
  private writeConnection?: Redis
  private writeConnectionPromise?: Promise<Redis>
  private writeCount: number = 0
  private readonly EXPIRE_INTERVAL = 100 // Refresh TTL every 100 writes

  /**
   * Creates a new RedisStream instance.
   * @param params - Parameters object
   * @param params.key - The Redis stream key
   * @param params.cap - Maximum number of entries in the stream (default: 10000)
   * @param params.ttl - Time-to-live for the stream key in seconds (default: keep alive timeout)
   */
  constructor({
    key,
    cap = 10000,
    ttl = env.KEEP_ALIVE_TIMEOUT / 1000,
  }: {
    key: string
    cap?: number
    ttl?: number
  }) {
    this.key = key
    this.cap = cap
    this.ttl = ttl
  }

  /**
   * Writes an event to the Redis stream.
   * Automatically handles MAXLEN trimming and key expiration.
   * Reuses a persistent connection for efficiency and only refreshes TTL periodically.
   * @param event - The event data to write (will be JSON serialized)
   */
  async write(event: unknown): Promise<void> {
    if (!this.writeConnection) {
      // Using a promise to avoid race conditions when multiple writes ask for a write connection at the same time.
      if (!this.writeConnectionPromise) {
        this.writeConnectionPromise = cache().then((c) => c.duplicate())
      }
      this.writeConnection = await this.writeConnectionPromise
      // Clear promise once connection is established - we only need it during setup
      this.writeConnectionPromise = undefined
    }

    this.writeCount++
    const shouldExpire =
      this.writeCount === 1 || this.writeCount % this.EXPIRE_INTERVAL === 0

    // MULTI/EXEC adds overhead, only use it when needed
    if (shouldExpire) {
      await this.writeConnection
        .multi()
        .xadd(
          this.key,
          'MAXLEN',
          '~',
          this.cap,
          '*',
          'event',
          JSON.stringify(event),
        )
        .expire(this.key, this.ttl)
        .exec()
    } else {
      await this.writeConnection.xadd(
        this.key,
        'MAXLEN',
        '~',
        this.cap,
        '*',
        'event',
        JSON.stringify(event),
      )
    }
  }

  /**
   * Reads events from the Redis stream starting from the given ID.
   * Uses blocking read with timeout and respects abort signals.
   * Reuses a persistent connection for efficiency.
   * @param params - Parameters object
   * @param params.lastId - The stream ID to start reading from (e.g., '0-0' for start)
   * @param params.timeout - Timeout in milliseconds for the blocking read (default: keep alive timeout)
   * @param params.abortSignal - Optional abort signal to cancel the read operation
   * @returns Object with result array and updated lastId, or null if no data or aborted
   */
  async read({
    lastId,
    timeout = env.KEEP_ALIVE_TIMEOUT / 1000,
    abortSignal,
  }: {
    lastId: string
    timeout?: number
    abortSignal?: AbortSignal
  }): Promise<{ result: [string, string[]][]; lastId: string } | null> {
    if (abortSignal?.aborted) return null
    if (!this.connection) {
      this.connection = await cache().then((c) => c.duplicate())
    }

    const result = await this.connection.xread(
      'BLOCK',
      timeout,
      'STREAMS',
      this.key,
      lastId,
    )
    if (!result || result.length === 0) return null

    const events = result[0][1]
    const newLastId = events[events.length - 1]?.[0] ?? lastId
    return { result: events, lastId: newLastId }
  }

  /**
   * Closes the persistent Redis connections used for reading and writing.
   * Should be called when done with the stream to free resources.
   */
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.quit()
      this.connection = undefined
    }
    if (this.writeConnection) {
      await this.writeConnection.quit()
      this.writeConnection = undefined
    }
  }

  /**
   * Cleans up the stream by setting an expiration time.
   * Allows consumers a grace period to read the latest events before cleanup.
   * @param gracePeriodSeconds - Time in seconds before the stream expires (default: 10)
   */
  async cleanup(gracePeriodSeconds: number = 10): Promise<void> {
    await cache().then((c) => c.expire(this.key, gracePeriodSeconds))
  }
}
