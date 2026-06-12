import { Effect } from "effect"
import type { DestinationSyncRun } from "../entities/destination-sync-run.ts"
import type { DestinationSyncRunRepositoryShape } from "../ports/destination-sync-run-repository.ts"

export const createFakeDestinationSyncRunRepository = (seed: readonly DestinationSyncRun[] = []) => {
  const rows: DestinationSyncRun[] = [...seed]

  const repo: DestinationSyncRunRepositoryShape = {
    insert: (run) =>
      Effect.sync(() => {
        rows.push(run)
      }),
    listByDestinationId: ({ destinationId, limit }) =>
      Effect.sync(() =>
        rows
          .filter((r) => r.destinationId === destinationId)
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
          .slice(0, limit),
      ),
    deleteByDestinationIds: (ids) =>
      Effect.sync(() => {
        const set = new Set(ids)
        for (let i = rows.length - 1; i >= 0; i--) {
          const row = rows[i]
          if (row && set.has(row.destinationId)) rows.splice(i, 1)
        }
      }),
    pruneFinishedBefore: (cutoff) =>
      Effect.sync(() => {
        let pruned = 0
        for (let i = rows.length - 1; i >= 0; i--) {
          const row = rows[i]
          if (row && row.finishedAt.getTime() < cutoff.getTime()) {
            rows.splice(i, 1)
            pruned++
          }
        }
        return pruned
      }),
  }

  return { repo, rows }
}
