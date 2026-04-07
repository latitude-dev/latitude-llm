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
  logTouchBuffer?: boolean
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
  private readonly logTouchBuffer: boolean

  constructor(client: PostgresClient, config: TouchBufferConfig = {}) {
    this.client = client
    this.intervalMs = config.intervalMs ?? 30000
    this.maxBufferSize = config.maxBufferSize ?? 10000
    this.logTouchBuffer = config.logTouchBuffer ?? false

    this.startFlushInterval()

    this.log({
      message: `initialized with ${this.intervalMs}ms interval, max buffer size ${this.maxBufferSize}`,
      type: "info",
    })
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
      this.log({
        message: `Buffer size ${this.buffer.size} exceeded max ${this.maxBufferSize}, forcing flush`,
        type: "warn",
      })
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

      this.log({
        message: `Flushed ${keyIds.length} touch updates in ${Date.now() - startTime}ms`,
        type: "info",
      })
    } catch (error) {
      this.log({
        message: `Failed to flush touch updates: ${error instanceof Error ? error.message : "Unknown error"}`,
        type: "error",
      })

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
        this.log({
          message: `Trimmed ${entriesToRemove} oldest entries from buffer after flush failure`,
          type: "warn",
        })
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
    this.log({
      message: `Destroying TouchBuffer with ${this.buffer.size} pending updates`,
      type: "info",
    })

    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }

    await this.flush()

    this.log({
      message: `TouchBuffer destroyed with ${this.buffer.size} pending updates (should be 0)`,
      type: "info",
    })
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      void this.flush()
    }, this.intervalMs)

    if (this.flushInterval.unref) {
      this.flushInterval.unref()
    }
  }

  private log({ message, type }: { message: string; type: "info" | "warn" | "error" }): void {
    if (!this.logTouchBuffer) return
    const logPrefix = `[TouchBuffer]`
    const logFn = type === "warn" ? logger.warn : logger.info
    logFn(`${logPrefix} ${message}`)
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
