import { ApiKeyRepository } from "@domain/api-keys"
import { ApiKeyId } from "@domain/shared"
import type { PostgresClient } from "@platform/db-postgres"
import { ApiKeyRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("touch-buffer")

/**
 * Configuration options for TouchBuffer.
 */
interface TouchBufferConfig {
  /** Flush interval in milliseconds (default: 30000ms = 30s) */
  intervalMs?: number
  /** Maximum buffer size before forced flush (default: 10000) */
  maxBufferSize?: number
}

/**
 * In-memory buffer for batching API key touch updates.
 *
 * This class buffers touch updates in memory and flushes them periodically
 * to reduce database write load. Instead of writing on every API key request,
 * updates are batched and written in a single query.
 *
 * Performance impact:
 * - Reduces writes by 90%+ (30s window / avg 100ms request = 300:1 reduction)
 * - lastUsedAt accuracy reduced to flush interval (+/-30 seconds by default)
 *
 * Usage:
 * ```typescript
 * const touchBuffer = createTouchBuffer() // Uses singleton
 * touchBuffer.touch(apiKey.id) // Fast, in-memory only
 *
 * // On shutdown:
 * touchBuffer.destroy() // Final flush
 * ```
 */
class TouchBuffer {
  private buffer = new Map<string, number>() // keyId -> timestamp
  private flushInterval: NodeJS.Timeout | null = null
  private readonly intervalMs: number
  private readonly maxBufferSize: number
  private readonly client: PostgresClient

  constructor(client: PostgresClient, config: TouchBufferConfig = {}) {
    this.client = client
    this.intervalMs = config.intervalMs ?? 30000
    this.maxBufferSize = config.maxBufferSize ?? 10000

    this.startFlushInterval()

    logger.info(`TouchBuffer initialized with ${this.intervalMs}ms interval, max buffer size ${this.maxBufferSize}`)
  }

  /**
   * Record a touch for an API key.
   *
   * This is a fast, in-memory operation. The actual database update
   * happens asynchronously during the next flush cycle.
   *
   * @param keyId - The API key ID to touch
   */
  touch(keyId: string): void {
    this.buffer.set(keyId, Date.now())

    // Force flush if buffer exceeds max size
    if (this.buffer.size >= this.maxBufferSize) {
      logger.warn(`Buffer size ${this.buffer.size} exceeded max ${this.maxBufferSize}, forcing flush`)
      void this.flush()
    }
  }

  /**
   * Get current buffer size (for monitoring).
   */
  getBufferSize(): number {
    return this.buffer.size
  }

  /**
   * Manually trigger a flush (for testing or graceful shutdown).
   */
  async flush(): Promise<void> {
    if (this.buffer.size === 0) {
      return
    }

    // Copy and clear buffer atomically
    const batch = new Map(this.buffer)
    this.buffer.clear()

    const keyIds = Array.from(batch.keys()).map((id) => ApiKeyId(id))

    if (keyIds.length === 0) {
      return
    }

    const startTime = Date.now()

    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* ApiKeyRepository
          return yield* repo.touchBatch(keyIds)
        }).pipe(withPostgres(ApiKeyRepositoryLive, this.client)),
      )

      logger.info(`Flushed ${keyIds.length} touch updates in ${Date.now() - startTime}ms`)
    } catch (error) {
      logger.error(`Failed to flush touch updates: ${error instanceof Error ? error.message : "Unknown error"}`)

      // Re-add failed keys to buffer for retry (with limit to prevent unbounded growth)
      for (const [keyId, timestamp] of batch) {
        if (!this.buffer.has(keyId)) {
          this.buffer.set(keyId, timestamp)
        }
      }

      // Trim buffer if it grew too large during retry
      if (this.buffer.size > this.maxBufferSize * 1.5) {
        const entriesToRemove = this.buffer.size - this.maxBufferSize
        const entries = Array.from(this.buffer.entries())
        // Remove oldest entries (sorted by timestamp)
        entries.sort((a, b) => a[1] - b[1])
        for (let i = 0; i < entriesToRemove; i++) {
          this.buffer.delete(entries[i][0])
        }
        logger.warn(`Trimmed ${entriesToRemove} oldest entries from buffer after flush failure`)
      }
    }
  }

  /**
   * Stop the flush interval and perform a final flush.
   *
   * Call this during graceful shutdown to ensure all pending
   * touch updates are persisted.
   */
  async destroy(): Promise<void> {
    logger.info(`Destroying TouchBuffer with ${this.buffer.size} pending updates`)

    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }

    // Final flush
    await this.flush()

    logger.info("TouchBuffer destroyed")
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      void this.flush()
    }, this.intervalMs)

    // Ensure interval doesn't prevent process exit in tests/development
    if (this.flushInterval.unref) {
      this.flushInterval.unref()
    }
  }
}

/**
 * Create a singleton TouchBuffer instance.
 *
 * This factory ensures only one TouchBuffer exists per application instance.
 */
let touchBufferInstance: TouchBuffer | null = null

export const createTouchBuffer = (client: PostgresClient, config?: TouchBufferConfig): TouchBuffer => {
  if (!touchBufferInstance) {
    touchBufferInstance = new TouchBuffer(client, config)
  }
  return touchBufferInstance
}

/**
 * Destroy the singleton TouchBuffer instance.
 *
 * Call this during graceful shutdown.
 */
export const destroyTouchBuffer = async (): Promise<void> => {
  if (touchBufferInstance) {
    await touchBufferInstance.destroy()
    touchBufferInstance = null
  }
}
