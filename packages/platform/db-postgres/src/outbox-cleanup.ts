import { sql } from "drizzle-orm"
import { Data } from "effect"
import type { PostgresClient } from "./client.ts"

const OUTBOX_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const OUTBOX_CLEANUP_BATCH_SIZE = 1000
const OUTBOX_CLEANUP_MAX_BATCHES = 100

export interface OutboxCleanupResult {
  readonly cutoff: string
  readonly deletedCount: number
  readonly batchCount: number
  readonly durationMs: number
  readonly limitReached: boolean
}

export class OutboxCleanupError extends Data.TaggedError("OutboxCleanupError")<{
  readonly cause: unknown
  readonly progress: OutboxCleanupResult
}> {}

export const cleanupPublishedOutboxEvents = async (
  client: Pick<PostgresClient, "db">,
  options: { now?: Date; batchSize?: number; maxBatches?: number } = {},
): Promise<OutboxCleanupResult> => {
  const startedAt = performance.now()
  const cutoff = new Date((options.now ?? new Date()).getTime() - OUTBOX_RETENTION_MS).toISOString()
  const batchSize = options.batchSize ?? OUTBOX_CLEANUP_BATCH_SIZE
  const maxBatches = options.maxBatches ?? OUTBOX_CLEANUP_MAX_BATCHES
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || !Number.isSafeInteger(maxBatches) || maxBatches < 1) {
    throw new RangeError("Outbox cleanup batchSize and maxBatches must be positive safe integers")
  }

  let deletedCount = 0
  let batchCount = 0
  const progress = (limitReached: boolean): OutboxCleanupResult => ({
    cutoff,
    deletedCount,
    batchCount,
    durationMs: performance.now() - startedAt,
    limitReached,
  })

  try {
    while (batchCount < maxBatches) {
      // Each statement commits independently; never wrap the cleanup run in a transaction.
      const result = await client.db.execute<{ deleted_count: number }>(sql`
        WITH expired AS (
          SELECT id
          FROM latitude.outbox_events
          WHERE published = true AND published_at < ${cutoff}::timestamptz
          ORDER BY published_at ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        ), deleted AS (
          DELETE FROM latitude.outbox_events AS events
          USING expired
          WHERE events.id = expired.id
          RETURNING events.id
        )
        SELECT count(*)::integer AS deleted_count FROM deleted
      `)
      const count = result.rows[0]?.deleted_count ?? 0
      deletedCount += count
      batchCount += 1
      if (count < batchSize) return progress(false)
    }
    return progress(true)
  } catch (cause) {
    throw new OutboxCleanupError({ cause, progress: progress(false) })
  }
}
