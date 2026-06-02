import { AdminTaxonomyRepository } from "@domain/admin"
import { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { organizations } from "../schema/better-auth.ts"
import { projects } from "../schema/projects.ts"
import { taxonomyCategories } from "../schema/taxonomy-categories.ts"
import { taxonomyClusters } from "../schema/taxonomy-clusters.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AdminTaxonomyRepositoryLive } from "./admin-taxonomy-repository.ts"

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, AdminTaxonomyRepository>) =>
  Effect.runPromise(effect.pipe(withPostgres(AdminTaxonomyRepositoryLive, pg.adminPostgresClient)))

const makeId = (prefix: string): string => prefix.padEnd(24, "x").slice(0, 24)

const ORG = makeId("org-tax-target")
const OTHER_ORG = makeId("org-tax-other")
const PROJECT = makeId("proj-tax-target")
const OTHER_PROJECT = makeId("proj-tax-other")
const CATEGORY = makeId("cat-tax-checkout")
const SUBCATEGORY = makeId("clu-tax-card")
const UNCATEGORIZED = makeId("clu-tax-uncat")
const OTHER_SUBCATEGORY = makeId("clu-tax-other")

const centroid = {
  base: [],
  mass: 0,
  model: "test-model",
  decay: 1,
  weights: { default: 1 },
}

describe("AdminTaxonomyRepositoryLive.getProjectTaxonomy", () => {
  beforeAll(async () => {
    const baseTime = new Date("2026-01-01T00:00:00.000Z")

    await pg.db.insert(organizations).values([
      { id: ORG, name: "Taxonomy Co", slug: "taxonomy-co", createdAt: baseTime, updatedAt: baseTime },
      { id: OTHER_ORG, name: "Other Co", slug: "other-co", createdAt: baseTime, updatedAt: baseTime },
    ])

    await pg.db.insert(projects).values([
      {
        id: PROJECT,
        organizationId: ORG,
        name: "Checkout",
        slug: "checkout",
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: OTHER_PROJECT,
        organizationId: OTHER_ORG,
        name: "Other",
        slug: "other",
        createdAt: baseTime,
        updatedAt: baseTime,
      },
    ])

    await pg.db.insert(taxonomyCategories).values([
      {
        id: CATEGORY,
        organizationId: ORG,
        projectId: PROJECT,
        name: "Checkout issues",
        description: "Problems during checkout.",
        clusterCount: 1,
        observationCount: 10,
        clusteredAt: baseTime,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: makeId("cat-tax-other"),
        organizationId: OTHER_ORG,
        projectId: OTHER_PROJECT,
        name: "Other category",
        description: "Should not be returned.",
        clusterCount: 1,
        observationCount: 99,
        clusteredAt: baseTime,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
    ])

    await pg.db.insert(taxonomyClusters).values([
      {
        id: SUBCATEGORY,
        organizationId: ORG,
        projectId: PROJECT,
        parentCategoryId: CATEGORY,
        name: "Card declined",
        description: "Users see card declines.",
        centroid,
        observationCount: 7,
        firstObservedAt: baseTime,
        lastObservedAt: new Date(baseTime.getTime() + 1000),
        clusteredAt: baseTime,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: UNCATEGORIZED,
        organizationId: ORG,
        projectId: PROJECT,
        parentCategoryId: null,
        name: "Pending label",
        description: "No category yet.",
        centroid,
        observationCount: 3,
        firstObservedAt: baseTime,
        lastObservedAt: baseTime,
        clusteredAt: baseTime,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: OTHER_SUBCATEGORY,
        organizationId: OTHER_ORG,
        projectId: OTHER_PROJECT,
        parentCategoryId: makeId("cat-tax-other"),
        name: "Other cluster",
        description: "Should not be returned.",
        centroid,
        observationCount: 99,
        firstObservedAt: baseTime,
        lastObservedAt: baseTime,
        clusteredAt: baseTime,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
    ])
  })

  it("returns categories with assigned and uncategorized subcategories for the project", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminTaxonomyRepository
        return yield* repo.getProjectTaxonomy(ProjectId(PROJECT))
      }),
    )

    expect(result.categories).toHaveLength(1)
    expect(result.categories[0]?.id).toBe(CATEGORY)
    expect(result.categories[0]?.subcategories.map((subcategory) => subcategory.id)).toEqual([SUBCATEGORY])
    expect(result.uncategorized.map((subcategory) => subcategory.id)).toEqual([UNCATEGORIZED])
  })

  it("fails with NotFoundError for a non-existent project id", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* AdminTaxonomyRepository
          return yield* repo.getProjectTaxonomy(ProjectId(makeId("proj-tax-missing")))
        }),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Project" })
  })
})
