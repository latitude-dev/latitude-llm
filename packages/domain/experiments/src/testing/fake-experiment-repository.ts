import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { Experiment } from "../entities/experiment.ts"
import type { ExperimentListPage, ExperimentRepositoryShape } from "../ports/experiment-repository.ts"

const isLive = (experiment: Experiment) => experiment.deletedAt === null

export const createFakeExperimentRepository = (seed: readonly Experiment[] = []) => {
  const experiments: Experiment[] = [...seed]

  const liveById = (id: string) => experiments.find((experiment) => experiment.id === id && isLive(experiment))
  const replace = (id: string, next: Experiment) => {
    const index = experiments.findIndex((experiment) => experiment.id === id)
    if (index >= 0) experiments[index] = next
  }

  const repo: ExperimentRepositoryShape = {
    findById: (id) =>
      Effect.suspend(() => {
        const experiment = liveById(id)
        return experiment ? Effect.succeed(experiment) : Effect.fail(new NotFoundError({ entity: "Experiment", id }))
      }),
    findBySlug: ({ projectId, slug }) =>
      Effect.suspend(() => {
        const experiment = experiments.find((e) => e.projectId === projectId && e.slug === slug && isLive(e))
        return experiment
          ? Effect.succeed(experiment)
          : Effect.fail(new NotFoundError({ entity: "Experiment", id: slug }))
      }),
    list: ({ projectId, limit, offset, searchQuery }) =>
      Effect.sync<ExperimentListPage>(() => {
        const query = searchQuery?.toLowerCase()
        const all = experiments
          .filter((e) => e.projectId === projectId && isLive(e))
          .filter((e) => (query ? e.name.toLowerCase().includes(query) : true))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        const items = all.slice(offset, offset + limit)
        return { items, totalCount: all.length, hasMore: offset + items.length < all.length, limit, offset }
      }),
    searchOrgWide: ({ searchQuery, limit }) =>
      Effect.sync(() => {
        const query = searchQuery?.trim().toLowerCase()
        return experiments
          .filter(isLive)
          .filter((e) => (query ? e.name.toLowerCase().includes(query) : true))
          .slice(0, limit)
          .map((e) => ({
            id: e.id,
            projectId: e.projectId,
            projectSlug: `project-${e.projectId}`,
            projectName: `Project ${e.projectId}`,
            slug: e.slug,
            name: e.name,
            variantCount: e.variants.length,
          }))
      }),
    create: (experiment) =>
      Effect.sync(() => {
        experiments.push(experiment)
      }),
    save: (experiment) =>
      Effect.suspend(() => {
        if (!liveById(experiment.id)) return Effect.fail(new NotFoundError({ entity: "Experiment", id: experiment.id }))
        replace(experiment.id, experiment)
        return Effect.void
      }),
    softDelete: (id) =>
      Effect.suspend(() => {
        const experiment = liveById(id)
        if (!experiment) return Effect.fail(new NotFoundError({ entity: "Experiment", id }))
        replace(id, { ...experiment, deletedAt: new Date(), updatedAt: new Date() })
        return Effect.void
      }),
    countActiveBySlug: ({ projectId, slug, excludeId }) =>
      Effect.sync(
        () =>
          experiments.filter((e) => e.projectId === projectId && e.slug === slug && e.id !== excludeId && isLive(e))
            .length,
      ),
  }

  return { repo, experiments }
}
