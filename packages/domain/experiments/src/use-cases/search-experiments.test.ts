import { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type Experiment, type ExperimentVariant, experimentSchema } from "../entities/experiment.ts"
import { ExperimentRepository, type ExperimentRepositoryShape } from "../ports/experiment-repository.ts"
import { createFakeExperimentRepository } from "../testing/fake-experiment-repository.ts"
import { searchExperimentsUseCase } from "./search-experiments.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

const provide = (repo: ExperimentRepositoryShape) =>
  Layer.mergeAll(
    Layer.succeed(ExperimentRepository, ExperimentRepository.of(repo)),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
  )

const run = <A, E>(effect: Effect.Effect<A, E, SqlClient | ExperimentRepository>, repo: ExperimentRepositoryShape) =>
  Effect.runPromise(effect.pipe(Effect.provide(provide(repo))))

const variant = (id: string): ExperimentVariant => ({
  id,
  name: "Baseline",
  baseline: true,
  filterSet: {},
  query: null,
  timeRange: null,
})

const seed = (input: { id: string; name: string; slug: string; variants?: Experiment["variants"] }): Experiment =>
  experimentSchema.parse({
    id: input.id,
    organizationId,
    projectId,
    slug: input.slug,
    name: input.name,
    description: "",
    variants: input.variants ?? [],
    deletedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  })

describe("searchExperimentsUseCase", () => {
  it("returns experiments whose name matches the query, with project + variant metadata", async () => {
    const { repo } = createFakeExperimentRepository([
      seed({ id: "a".repeat(24), name: "Checkout comparison", slug: "checkout", variants: [variant("v".repeat(24))] }),
      seed({ id: "b".repeat(24), name: "Onboarding", slug: "onboarding" }),
    ])
    const results = await run(searchExperimentsUseCase({ searchQuery: "checkout" }), repo)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      slug: "checkout",
      name: "Checkout comparison",
      projectId,
      variantCount: 1,
    })
    expect(results[0]?.projectSlug).toBeTruthy()
  })

  it("returns every experiment when no query is given", async () => {
    const { repo } = createFakeExperimentRepository([
      seed({ id: "a".repeat(24), name: "Checkout", slug: "checkout" }),
      seed({ id: "b".repeat(24), name: "Onboarding", slug: "onboarding" }),
    ])
    const results = await run(searchExperimentsUseCase({}), repo)
    expect(results).toHaveLength(2)
  })

  it("respects the limit", async () => {
    const experiments = Array.from({ length: 5 }, (_, index) =>
      seed({ id: String(index).padStart(24, "0"), name: `Experiment ${index}`, slug: `experiment-${index}` }),
    )
    const { repo } = createFakeExperimentRepository(experiments)
    const results = await run(searchExperimentsUseCase({ searchQuery: "experiment", limit: 2 }), repo)
    expect(results).toHaveLength(2)
  })
})
