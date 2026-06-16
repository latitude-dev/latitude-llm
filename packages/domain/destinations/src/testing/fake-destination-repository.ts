import { ConflictError, type DestinationId, NotFoundError, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { DESTINATION_IDLE_BACKOFF_MAX_MS } from "../constants.ts"
import type { Destination } from "../entities/destination.ts"
import type { DestinationCursor, DestinationRepositoryShape } from "../ports/destination-repository.ts"

const sameCursor = (row: Destination, expected: DestinationCursor) =>
  row.cursorIngestedAt.getTime() === expected.ingestedAt.getTime() && row.cursorSpanId === expected.spanId

/**
 * Minimal in-memory DestinationRepository for unit tests. Mirrors the real
 * repo's contract: `save` fails with `ConflictError` when another row holds
 * `(projectId, kind)`, `advanceCursor` is a CAS that rejects stale writes, and
 * `listDue` applies the idle-backoff formula (sandbox exclusion is a SQL join
 * in the real repo — seed only non-sandbox rows here).
 */
export const createFakeDestinationRepository = (seed: readonly Destination[] = []) => {
  const rows: Destination[] = [...seed]

  const repo: DestinationRepositoryShape = {
    save: (destination) =>
      Effect.suspend(() => {
        const conflict = rows.find(
          (r) => r.id !== destination.id && r.projectId === destination.projectId && r.kind === destination.kind,
        )
        if (conflict) {
          return Effect.fail(new ConflictError({ entity: "Destination", field: "kind", value: destination.kind }))
        }
        const index = rows.findIndex((r) => r.id === destination.id)
        if (index >= 0) rows[index] = { ...destination, updatedAt: new Date() }
        else rows.push(destination)
        return Effect.void
      }),
    findById: (id: DestinationId) =>
      Effect.suspend(() => {
        const row = rows.find((r) => r.id === id)
        if (!row) return Effect.fail(new NotFoundError({ entity: "Destination", id }))
        return Effect.succeed(row)
      }),
    listByProjectId: (projectId: ProjectId) =>
      Effect.sync(() =>
        rows.filter((r) => r.projectId === projectId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),
    delete: (id: DestinationId) =>
      Effect.sync(() => {
        const index = rows.findIndex((r) => r.id === id)
        if (index >= 0) rows.splice(index, 1)
      }),
    listDue: (now: Date) =>
      Effect.sync(() =>
        rows.filter((r) => {
          if (r.status !== "active") return false
          if (r.lastRunAt === null) return true
          const backoffMs = Math.min(r.config.intervalMs * 2 ** r.consecutiveEmptyRuns, DESTINATION_IDLE_BACKOFF_MAX_MS)
          return r.lastRunAt.getTime() + backoffMs <= now.getTime()
        }),
      ),
    advanceCursor: ({ id, expected, next }) =>
      Effect.sync(() => {
        const row = rows.find((r) => r.id === id)
        if (!row || !sameCursor(row, expected)) return false
        ;(row as { cursorIngestedAt: Date }).cursorIngestedAt = next.ingestedAt
        ;(row as { cursorSpanId: string }).cursorSpanId = next.spanId
        return true
      }),
    updateRunState: ({ id, status, consecutiveFailures, consecutiveEmptyRuns, lastFailureMessage, lastRunAt }) =>
      Effect.sync(() => {
        const index = rows.findIndex((r) => r.id === id)
        if (index < 0) return
        const row = rows[index]
        if (!row) return
        rows[index] = {
          ...row,
          status,
          consecutiveFailures,
          consecutiveEmptyRuns,
          lastFailureMessage,
          lastRunAt,
          updatedAt: new Date(),
        }
      }),
    deleteByProjectId: (projectId: ProjectId) =>
      Effect.sync(() => {
        const deleted = rows.filter((r) => r.projectId === projectId).map((r) => r.id)
        for (let i = rows.length - 1; i >= 0; i--) {
          const row = rows[i]
          if (row && row.projectId === projectId) rows.splice(i, 1)
        }
        return deleted
      }),
  }

  return { repo, rows }
}
