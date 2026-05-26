import { NotFoundError, type TaxonomyRunId } from "@domain/shared"
import { Effect } from "effect"
import type { TaxonomyRun } from "../entities/lineage.ts"
import type { TaxonomyRunRepositoryShape } from "../ports/taxonomy-run-repository.ts"

export const createFakeTaxonomyRunRepository = (
  seed: readonly TaxonomyRun[] = [],
  overrides?: Partial<TaxonomyRunRepositoryShape>,
) => {
  const runs = new Map<TaxonomyRunId, TaxonomyRun>(seed.map((run) => [run.id, run] as const))

  const repository: TaxonomyRunRepositoryShape = {
    findById: (id) =>
      Effect.gen(function* () {
        const run = runs.get(id)
        if (!run) return yield* new NotFoundError({ entity: "TaxonomyRun", id })
        return run
      }),

    findLatestByProject: ({ projectId }) =>
      Effect.sync(() => {
        const candidates = [...runs.values()]
          .filter((run) => run.projectId === projectId)
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        return candidates[0] ?? null
      }),

    listRunning: ({ projectId }) =>
      Effect.sync(() => [...runs.values()].filter((run) => run.projectId === projectId && run.status === "running")),

    listRecentCompleted: ({ projectId, limit }) =>
      Effect.sync(() =>
        [...runs.values()]
          .filter((run) => run.projectId === projectId && run.status === "completed")
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
          .slice(0, limit),
      ),

    insert: (run) =>
      Effect.sync(() => {
        runs.set(run.id, run)
      }),

    save: (run) =>
      Effect.sync(() => {
        runs.set(run.id, run)
      }),

    ...overrides,
  }

  return { repository, runs }
}
