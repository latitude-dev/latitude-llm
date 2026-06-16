import type { DestinationId } from "@domain/shared"
import { Effect } from "effect"
import { DESTINATION_IDLE_BACKOFF_MAX_MS } from "../constants.ts"
import type { Destination } from "../entities/destination.ts"
import type { DestinationSourceCursor } from "../entities/destination-source-cursor.ts"
import type {
  DestinationSourceCursorRepositoryShape,
  DueDestinationSource,
} from "../ports/destination-source-cursor-repository.ts"

/**
 * In-memory DestinationSourceCursorRepository. `listDue` joins cursor rows to
 * the destinations array (the real repo does this in SQL) and applies the
 * idle-backoff formula; `advanceCursor` is a CAS that rejects stale writes.
 * Pass the same `destinations` array the fake DestinationRepository holds so the
 * join stays consistent. Seed only non-sandbox, active rows — sandbox exclusion
 * is a SQL join in the real repo.
 */
export const createFakeDestinationSourceCursorRepository = (
  seedCursors: readonly DestinationSourceCursor[] = [],
  destinations: readonly Destination[] = [],
) => {
  const rows: DestinationSourceCursor[] = [...seedCursors]
  const find = (destinationId: DestinationId, source: string) =>
    rows.find((r) => r.destinationId === destinationId && r.source === source)

  const repo: DestinationSourceCursorRepositoryShape = {
    create: (cursor) =>
      Effect.sync(() => {
        rows.push(cursor)
      }),
    findByDestinationAndSource: ({ destinationId, source }) => Effect.sync(() => find(destinationId, source) ?? null),
    listDue: (now: Date) =>
      Effect.sync(() => {
        const due: DueDestinationSource[] = []
        for (const cursor of rows) {
          const destination = destinations.find((d) => d.id === cursor.destinationId)
          if (!destination || destination.status !== "active") continue
          if (cursor.lastRunAt === null) {
            due.push({ destination, cursor })
            continue
          }
          const backoffMs = Math.min(
            destination.config.intervalMs * 2 ** cursor.consecutiveEmptyRuns,
            DESTINATION_IDLE_BACKOFF_MAX_MS,
          )
          if (cursor.lastRunAt.getTime() + backoffMs <= now.getTime()) due.push({ destination, cursor })
        }
        return due
      }),
    advanceCursor: ({ destinationId, source, expected, next }) =>
      Effect.sync(() => {
        const row = find(destinationId, source)
        if (!row || row.watermark.getTime() !== expected.watermark.getTime() || row.watermarkId !== expected.id) {
          return false
        }
        ;(row as { watermark: Date }).watermark = next.watermark
        ;(row as { watermarkId: string }).watermarkId = next.id
        return true
      }),
    updateRunState: ({ destinationId, source, consecutiveEmptyRuns, lastRunAt }) =>
      Effect.sync(() => {
        const index = rows.findIndex((r) => r.destinationId === destinationId && r.source === source)
        if (index < 0) return
        const row = rows[index]
        if (!row) return
        rows[index] = { ...row, consecutiveEmptyRuns, lastRunAt, updatedAt: new Date() }
      }),
    deleteByDestinationId: (destinationId: DestinationId) =>
      Effect.sync(() => {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i]?.destinationId === destinationId) rows.splice(i, 1)
        }
      }),
  }

  return { repo, rows }
}
