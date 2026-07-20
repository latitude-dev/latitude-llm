import { ExperimentId, NotFoundError, OrganizationId, ProjectId, SqlClient, ValidationError } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type Experiment, type ExperimentVariant, experimentSchema } from "../entities/experiment.ts"
import { ExperimentRepository, type ExperimentRepositoryShape } from "../ports/experiment-repository.ts"
import { createFakeExperimentRepository } from "../testing/fake-experiment-repository.ts"
import { updateExperimentUseCase } from "./update-experiment.ts"

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

const variant = (overrides: Partial<ExperimentVariant> & { id: string }): ExperimentVariant => ({
  name: "Variant",
  baseline: false,
  filterSet: {},
  query: null,
  timeRange: null,
  ...overrides,
})

const seededExperiment = (variants: Experiment["variants"]): Experiment =>
  experimentSchema.parse({
    id: "e".repeat(24),
    organizationId,
    projectId,
    slug: "exp",
    name: "Exp",
    description: "Original",
    variants,
    deletedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  })

describe("updateExperimentUseCase", () => {
  it("replaces variants and keeps a single baseline", async () => {
    const experiment = seededExperiment([variant({ id: "a".repeat(24), name: "Baseline", baseline: true })])
    const { repo } = createFakeExperimentRepository([experiment])
    const result = await run(
      updateExperimentUseCase({
        id: experiment.id,
        variants: [
          { id: "a".repeat(24), name: "Baseline", baseline: false, filterSet: {}, query: null, timeRange: null },
          { id: "b".repeat(24), name: "Variant A", baseline: true, filterSet: {}, query: null, timeRange: null },
        ],
      }),
      repo,
    )
    expect(result.variants.map((v) => v.baseline)).toEqual([false, true])
  })

  it("promotes the first remaining variant to baseline when the replacement has none flagged", async () => {
    const experiment = seededExperiment([variant({ id: "a".repeat(24), name: "Baseline", baseline: true })])
    const { repo } = createFakeExperimentRepository([experiment])
    const result = await run(
      updateExperimentUseCase({
        id: experiment.id,
        variants: [
          { id: "b".repeat(24), name: "Variant A", baseline: false, filterSet: {}, query: null, timeRange: null },
          { id: "c".repeat(24), name: "Variant B", baseline: false, filterSet: {}, query: null, timeRange: null },
        ],
      }),
      repo,
    )
    expect(result.variants.map((v) => v.baseline)).toEqual([true, false])
  })

  it("re-slugs on rename", async () => {
    const experiment = seededExperiment([])
    const { repo } = createFakeExperimentRepository([experiment])
    const result = await run(updateExperimentUseCase({ id: experiment.id, name: "Renamed experiment" }), repo)
    expect(result.slug).toBe("renamed-experiment")
  })

  it("does not change the slug when the name is unchanged", async () => {
    const experiment = seededExperiment([])
    const { repo } = createFakeExperimentRepository([experiment])
    const result = await run(updateExperimentUseCase({ id: experiment.id, name: "Exp" }), repo)
    expect(result.slug).toBe("exp")
  })

  it("updates the description without touching the variants", async () => {
    const experiment = seededExperiment([variant({ id: "a".repeat(24), name: "Baseline", baseline: true })])
    const { repo } = createFakeExperimentRepository([experiment])
    const result = await run(updateExperimentUseCase({ id: experiment.id, description: "New description" }), repo)
    expect(result.description).toBe("New description")
    expect(result.variants).toHaveLength(1)
    expect(result.variants[0]?.baseline).toBe(true)
  })

  it("rejects more than the maximum number of variants", async () => {
    const experiment = seededExperiment([])
    const { repo } = createFakeExperimentRepository([experiment])
    const error = await runError(
      updateExperimentUseCase({
        id: experiment.id,
        variants: Array.from({ length: 11 }, (_, index) => ({
          name: `V${index}`,
          baseline: index === 0,
          filterSet: {},
          query: null,
          timeRange: null,
        })),
      }),
      repo,
    )
    expect(error).toBeInstanceOf(ValidationError)
  })

  it("tolerates a description-only edit on an experiment that already holds duplicate variant names", async () => {
    const experiment = seededExperiment([
      variant({ id: "a".repeat(24), name: "Variant C", baseline: true }),
      variant({ id: "b".repeat(24), name: "Variant C" }),
    ])
    const { repo } = createFakeExperimentRepository([experiment])
    const result = await run(updateExperimentUseCase({ id: experiment.id, description: "Updated" }), repo)
    expect(result.description).toBe("Updated")
    expect(result.variants).toHaveLength(2)
  })

  it("rejects two variants sharing the same name", async () => {
    const experiment = seededExperiment([variant({ id: "a".repeat(24), name: "Variant A", baseline: true })])
    const { repo } = createFakeExperimentRepository([experiment])
    const error = await runError(
      updateExperimentUseCase({
        id: experiment.id,
        variants: [
          { id: "a".repeat(24), name: "Variant A", baseline: true, filterSet: {}, query: null, timeRange: null },
          { id: "b".repeat(24), name: "Variant A", baseline: false, filterSet: {}, query: null, timeRange: null },
        ],
      }),
      repo,
    )
    expect(error).toBeInstanceOf(ValidationError)
  })

  it("rejects a blank name", async () => {
    const experiment = seededExperiment([])
    const { repo } = createFakeExperimentRepository([experiment])
    const error = await runError(updateExperimentUseCase({ id: experiment.id, name: "   " }), repo)
    expect(error).toBeInstanceOf(ValidationError)
  })

  it("fails with NotFoundError for a missing experiment", async () => {
    const { repo } = createFakeExperimentRepository()
    const error = await runError(updateExperimentUseCase({ id: ExperimentId("z".repeat(24)), name: "Whatever" }), repo)
    expect(error).toBeInstanceOf(NotFoundError)
  })
})
