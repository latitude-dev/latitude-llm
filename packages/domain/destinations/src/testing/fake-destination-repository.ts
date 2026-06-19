import { ConflictError, type DestinationId, NotFoundError, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { Destination } from "../entities/destination.ts"
import type { DestinationRepositoryShape } from "../ports/destination-repository.ts"

/**
 * Minimal in-memory DestinationRepository for unit tests. Mirrors the real
 * repo's contract: `save` fails with `ConflictError` when another row holds
 * `(projectId, kind)`, and `updateQuarantineState` writes destination-level
 * failure/quarantine bookkeeping. Per-source cursor state lives in
 * {@link createFakeDestinationSourceCursorRepository}.
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
    updateQuarantineState: ({ id, status, consecutiveFailures, lastFailureMessage }) =>
      Effect.sync(() => {
        const index = rows.findIndex((r) => r.id === id)
        if (index < 0) return
        const row = rows[index]
        if (!row) return
        rows[index] = { ...row, status, consecutiveFailures, lastFailureMessage, updatedAt: new Date() }
      }),
    updateStatus: ({ id, status }) =>
      Effect.sync(() => {
        const index = rows.findIndex((r) => r.id === id)
        if (index < 0) return
        const row = rows[index]
        if (!row) return
        rows[index] = { ...row, status, updatedAt: new Date() }
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
