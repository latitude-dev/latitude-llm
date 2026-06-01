import type { ProjectId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { getProjectTaxonomyUseCase } from "./get-project-taxonomy.ts"
import { AdminTaxonomyRepository } from "./taxonomy-repository.ts"
import type { AdminProjectTaxonomy } from "./taxonomy-result.ts"

const PROJECT_ID = "project-target" as ProjectId

const taxonomy: AdminProjectTaxonomy = {
  categories: [
    {
      id: "cat-1",
      name: "Checkout issues",
      description: "Problems during checkout.",
      clusterCount: 1,
      observationCount: 3,
      state: "active",
      clusteredAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      subcategories: [],
    },
  ],
  uncategorized: [],
}

const repo = Layer.succeed(AdminTaxonomyRepository, {
  getProjectTaxonomy: () => Effect.succeed(taxonomy),
})

describe("getProjectTaxonomyUseCase", () => {
  it("returns the taxonomy tree from the repository", async () => {
    const result = await Effect.runPromise(
      getProjectTaxonomyUseCase({ projectId: PROJECT_ID }).pipe(Effect.provide(repo)),
    )
    expect(result).toBe(taxonomy)
  })
})
