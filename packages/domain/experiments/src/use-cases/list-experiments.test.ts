import { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type Experiment, experimentSchema } from "../entities/experiment.ts"
import { ExperimentRepository, type ExperimentRepositoryShape } from "../ports/experiment-repository.ts"
import { createFakeExperimentRepository } from "../testing/fake-experiment-repository.ts"
import { listExperimentsUseCase } from "./list-experiments.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const otherProjectId = ProjectId("q".repeat(24))

const provide = (repo: ExperimentRepositoryShape) =>
  Layer.mergeAll(
    Layer.succeed(ExperimentRepository, ExperimentRepository.of(repo)),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
  )

const run = <A, E>(effect: Effect.Effect<A, E, SqlClient | ExperimentRepository>, repo: ExperimentRepositoryShape) =>
  Effect.runPromise(effect.pipe(Effect.provide(provide(repo))))

const seed = (input: {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly updatedAt: string
  readonly projectId?: ProjectId
  readonly deletedAt?: Date
}): Experiment =>
  experimentSchema.parse({
    id: input.id,
    organizationId,
    projectId: input.projectId ?? projectId,
    slug: input.slug,
    name: input.name,
    description: "",
    variants: [],
    deletedAt: input.deletedAt ?? null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date(input.updatedAt),
  })

const three = () => [
  seed({ id: "a".repeat(24), name: "Alpha", slug: "alpha", updatedAt: "2026-07-01T00:00:00.000Z" }),
  seed({ id: "b".repeat(24), name: "Bravo", slug: "bravo", updatedAt: "2026-07-03T00:00:00.000Z" }),
  seed({ id: "c".repeat(24), name: "Charlie", slug: "charlie", updatedAt: "2026-07-02T00:00:00.000Z" }),
]

describe("listExperimentsUseCase", () => {
  it("returns the project's experiments ordered by updatedAt descending", async () => {
    const { repo } = createFakeExperimentRepository(three())
    const page = await run(listExperimentsUseCase({ projectId }), repo)
    expect(page.totalCount).toBe(3)
    expect(page.items.map((e) => e.slug)).toEqual(["bravo", "charlie", "alpha"])
    expect(page.hasMore).toBe(false)
  })

  it("paginates with limit + offset and reports hasMore", async () => {
    const { repo } = createFakeExperimentRepository(three())
    const first = await run(listExperimentsUseCase({ projectId, limit: 2, offset: 0 }), repo)
    expect(first.items.map((e) => e.slug)).toEqual(["bravo", "charlie"])
    expect(first.hasMore).toBe(true)
    const second = await run(listExperimentsUseCase({ projectId, limit: 2, offset: 2 }), repo)
    expect(second.items.map((e) => e.slug)).toEqual(["alpha"])
    expect(second.hasMore).toBe(false)
  })

  it("filters by search query (name substring)", async () => {
    const { repo } = createFakeExperimentRepository(three())
    const page = await run(listExperimentsUseCase({ projectId, searchQuery: "brav" }), repo)
    expect(page.items.map((e) => e.slug)).toEqual(["bravo"])
    expect(page.totalCount).toBe(1)
  })

  it("excludes soft-deleted experiments and other projects", async () => {
    const experiments = [
      ...three(),
      seed({
        id: "d".repeat(24),
        name: "Deleted",
        slug: "deleted",
        updatedAt: "2026-07-05T00:00:00.000Z",
        deletedAt: new Date(),
      }),
      seed({
        id: "e".repeat(24),
        name: "Elsewhere",
        slug: "elsewhere",
        updatedAt: "2026-07-05T00:00:00.000Z",
        projectId: otherProjectId,
      }),
    ]
    const { repo } = createFakeExperimentRepository(experiments)
    const page = await run(listExperimentsUseCase({ projectId }), repo)
    expect(page.totalCount).toBe(3)
    expect(page.items.map((e) => e.slug)).not.toContain("deleted")
    expect(page.items.map((e) => e.slug)).not.toContain("elsewhere")
  })
})
