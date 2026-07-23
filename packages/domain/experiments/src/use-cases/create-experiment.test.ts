import { OrganizationId, ProjectId, SqlClient, ValidationError } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type Experiment, experimentSchema } from "../entities/experiment.ts"
import { ExperimentRepository, type ExperimentRepositoryShape } from "../ports/experiment-repository.ts"
import { createFakeExperimentRepository } from "../testing/fake-experiment-repository.ts"
import { createExperimentUseCase } from "./create-experiment.ts"

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
    slug: "checkout-comparison",
    name: "Checkout comparison",
    description: "",
    variants: [],
    deletedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  })

describe("createExperimentUseCase", () => {
  it("creates an experiment with two default variants (Variant A + Variant B) when none are provided", async () => {
    const { repo, experiments } = createFakeExperimentRepository()
    const result = await run(
      createExperimentUseCase({
        organizationId,
        projectId,
        name: "Checkout comparison",
        description: "Compare checkout",
      }),
      repo,
    )
    expect(result).toMatchObject({
      organizationId,
      projectId,
      slug: "checkout-comparison",
      name: "Checkout comparison",
      description: "Compare checkout",
      deletedAt: null,
    })
    expect(result.variants.map((v) => v.baseline)).toEqual([true, false])
    expect(result.variants.map((v) => v.name)).toEqual(["Variant A", "Variant B"])
    expect(experiments).toHaveLength(1)
    expect(experiments[0]).toEqual(result)
  })

  it("creates an empty experiment when an explicit empty variants array is provided", async () => {
    const { repo } = createFakeExperimentRepository()
    const result = await run(
      createExperimentUseCase({ organizationId, projectId, name: "Empty on purpose", variants: [] }),
      repo,
    )
    expect(result.variants).toHaveLength(0)
  })

  it("trims the name and description and derives the slug from the trimmed name", async () => {
    const { repo } = createFakeExperimentRepository()
    const result = await run(
      createExperimentUseCase({ organizationId, projectId, name: "  Padded name  ", description: "  spaced  " }),
      repo,
    )
    expect(result.name).toBe("Padded name")
    expect(result.description).toBe("spaced")
    expect(result.slug).toBe("padded-name")
  })

  it("defaults the description to an empty string when omitted", async () => {
    const { repo } = createFakeExperimentRepository()
    const result = await run(createExperimentUseCase({ organizationId, projectId, name: "No description" }), repo)
    expect(result.description).toBe("")
  })

  it("suffixes the slug when it collides with an existing experiment in the project", async () => {
    const existing = seededExperiment({ slug: "checkout-comparison" })
    const { repo } = createFakeExperimentRepository([existing])
    const result = await run(createExperimentUseCase({ organizationId, projectId, name: "Checkout comparison" }), repo)
    expect(result.slug).not.toBe("checkout-comparison")
    expect(result.slug.startsWith("checkout-comparison-")).toBe(true)
  })

  it("normalizes provided variants to a single baseline, generated ids, and default names", async () => {
    const { repo } = createFakeExperimentRepository()
    const result = await run(
      createExperimentUseCase({
        organizationId,
        projectId,
        name: "With variants",
        variants: [
          { filterSet: {}, query: null, timeRange: null },
          { filterSet: {}, query: null, timeRange: null },
        ],
      }),
      repo,
    )
    expect(result.variants.map((v) => v.baseline)).toEqual([true, false])
    expect(result.variants.map((v) => v.name)).toEqual(["Variant A", "Variant B"])
    expect(new Set(result.variants.map((v) => v.id)).size).toBe(2)
  })

  it("letters default variant names by position regardless of which one is the baseline", async () => {
    const { repo } = createFakeExperimentRepository()
    const result = await run(
      createExperimentUseCase({
        organizationId,
        projectId,
        name: "Explicit baseline",
        variants: [
          { baseline: false, filterSet: {}, query: null, timeRange: null },
          { baseline: true, filterSet: {}, query: null, timeRange: null },
        ],
      }),
      repo,
    )
    expect(result.variants.map((v) => v.baseline)).toEqual([false, true])
    expect(result.variants.map((v) => v.name)).toEqual(["Variant A", "Variant B"])
  })

  it("keeps user-provided variant names", async () => {
    const { repo } = createFakeExperimentRepository()
    const result = await run(
      createExperimentUseCase({
        organizationId,
        projectId,
        name: "Named variants",
        variants: [{ name: "Control", filterSet: {}, query: null, timeRange: null }],
      }),
      repo,
    )
    expect(result.variants[0]?.name).toBe("Control")
    expect(result.variants[0]?.baseline).toBe(true)
  })

  it("rejects two variants sharing the same name", async () => {
    const { repo } = createFakeExperimentRepository()
    const error = await runError(
      createExperimentUseCase({
        organizationId,
        projectId,
        name: "Dupes",
        variants: [
          { name: "Same", baseline: true, filterSet: {}, query: null, timeRange: null },
          { name: "Same", baseline: false, filterSet: {}, query: null, timeRange: null },
        ],
      }),
      repo,
    )
    expect(error).toBeInstanceOf(ValidationError)
  })

  it("rejects a blank name", async () => {
    const { repo } = createFakeExperimentRepository()
    const error = await runError(createExperimentUseCase({ organizationId, projectId, name: "  " }), repo)
    expect(error).toBeInstanceOf(ValidationError)
  })
})
