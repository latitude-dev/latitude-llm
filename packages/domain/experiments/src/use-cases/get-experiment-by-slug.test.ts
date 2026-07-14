import { NotFoundError, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type Experiment, experimentSchema } from "../entities/experiment.ts"
import { ExperimentRepository, type ExperimentRepositoryShape } from "../ports/experiment-repository.ts"
import { createFakeExperimentRepository } from "../testing/fake-experiment-repository.ts"
import { getExperimentBySlugUseCase } from "./get-experiment-by-slug.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const provide = (repo: ExperimentRepositoryShape) =>
  Layer.mergeAll(
    Layer.succeed(ExperimentRepository, ExperimentRepository.of(repo)),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
  )

const run = <A, E>(effect: Effect.Effect<A, E, SqlClient | ExperimentRepository>, repo: ExperimentRepositoryShape) =>
  Effect.runPromise(effect.pipe(Effect.provide(provide(repo))))

const runError = <A, E>(
  effect: Effect.Effect<A, E, SqlClient | ExperimentRepository>,
  repo: ExperimentRepositoryShape,
) => Effect.runPromise(effect.pipe(Effect.flip, Effect.provide(provide(repo))))

const seededExperiment = (overrides: Partial<Experiment>): Experiment =>
  experimentSchema.parse({
    id: "e".repeat(24),
    organizationId,
    projectId,
    slug: "exp",
    name: "Exp",
    description: "",
    variants: [],
    deletedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  })

describe("getExperimentBySlugUseCase", () => {
  it("returns the experiment matching the project + slug", async () => {
    const experiment = seededExperiment({ slug: "checkout" })
    const { repo } = createFakeExperimentRepository([experiment])
    const result = await run(getExperimentBySlugUseCase({ projectId, slug: "checkout" }), repo)
    expect(result.id).toBe(experiment.id)
    expect(result.slug).toBe("checkout")
  })

  it("fails with NotFoundError when no experiment has that slug", async () => {
    const { repo } = createFakeExperimentRepository([seededExperiment({ slug: "checkout" })])
    const error = await runError(getExperimentBySlugUseCase({ projectId, slug: "missing" }), repo)
    expect(error).toBeInstanceOf(NotFoundError)
  })

  it("does not return a soft-deleted experiment", async () => {
    const experiment = seededExperiment({ slug: "checkout", deletedAt: new Date("2026-07-02T00:00:00.000Z") })
    const { repo } = createFakeExperimentRepository([experiment])
    const error = await runError(getExperimentBySlugUseCase({ projectId, slug: "checkout" }), repo)
    expect(error).toBeInstanceOf(NotFoundError)
  })
})
