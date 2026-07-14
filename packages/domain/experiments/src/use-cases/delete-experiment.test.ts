import { ExperimentId, NotFoundError, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type Experiment, experimentSchema } from "../entities/experiment.ts"
import { ExperimentRepository, type ExperimentRepositoryShape } from "../ports/experiment-repository.ts"
import { createFakeExperimentRepository } from "../testing/fake-experiment-repository.ts"
import { deleteExperimentUseCase } from "./delete-experiment.ts"

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

const seededExperiment = (): Experiment =>
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
  })

describe("deleteExperimentUseCase", () => {
  it("soft-deletes the experiment and returns it with deletedAt set", async () => {
    const experiment = seededExperiment()
    const { repo, experiments } = createFakeExperimentRepository([experiment])
    const result = await run(deleteExperimentUseCase({ id: experiment.id }), repo)
    expect(result.deletedAt).not.toBeNull()
    expect(experiments[0]?.deletedAt).not.toBeNull()
  })

  it("hides the experiment from subsequent live lookups", async () => {
    const experiment = seededExperiment()
    const { repo } = createFakeExperimentRepository([experiment])
    await run(deleteExperimentUseCase({ id: experiment.id }), repo)
    const error = await runError(deleteExperimentUseCase({ id: experiment.id }), repo)
    expect(error).toBeInstanceOf(NotFoundError)
  })

  it("fails with NotFoundError for a missing experiment", async () => {
    const { repo } = createFakeExperimentRepository()
    const error = await runError(deleteExperimentUseCase({ id: ExperimentId("z".repeat(24)) }), repo)
    expect(error).toBeInstanceOf(NotFoundError)
  })
})
