import { CustomBehaviorId, FacetId, OrganizationId, ProjectId, type SqlClient, TaxonomyClusterId } from "@domain/shared"
import { TaxonomyClusterRepository } from "@domain/taxonomy"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { taxonomyClusters } from "../schema/taxonomy-clusters.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { TaxonomyClusterRepositoryLive } from "./taxonomy-cluster-repository.ts"

const pg = setupTestPostgres()

const makeId = (prefix: string): string => prefix.padEnd(24, "x").slice(0, 24)

const ORG = OrganizationId(makeId("org-clusters"))

// The org must be passed: every write here filters on the SqlClient's org, and
// `withPostgres` otherwise defaults to "system", which matches nothing seeded below.
const runWithLive = <A, E>(effect: Effect.Effect<A, E, TaxonomyClusterRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(TaxonomyClusterRepositoryLive, pg.adminPostgresClient, ORG)))
const PROJECT = ProjectId(makeId("proj-clusters"))
const OTHER_PROJECT = ProjectId(makeId("proj-other"))
const BEHAVIOR = CustomBehaviorId(makeId("behavior-one"))
const OTHER_BEHAVIOR = CustomBehaviorId(makeId("behavior-two"))
const FACET = FacetId(makeId("facet-one"))

const at = new Date("2026-01-01T00:00:00.000Z")

/**
 * Seeded through the schema rather than `repo.save`: save derives a pgvector centroid
 * and rejects any model but the configured embedding one, which has nothing to do with
 * what these tests are about.
 */
const seedCluster = async (overrides: {
  readonly id: string
  readonly projectId?: ProjectId
  readonly customBehaviorId?: CustomBehaviorId | null
  readonly facetId?: FacetId | null
  readonly state?: "active" | "staging"
}) => {
  await pg.db.insert(taxonomyClusters).values({
    id: TaxonomyClusterId(makeId(overrides.id)),
    organizationId: ORG,
    projectId: overrides.projectId ?? PROJECT,
    customBehaviorId: overrides.customBehaviorId ?? null,
    facetId: overrides.facetId ?? null,
    parentClusterId: null,
    depth: 0,
    path: "",
    splitLinkThreshold: null,
    name: "Refund requests",
    description: "Users asking for refunds.",
    centroid: { base: [], mass: 0, model: "fake-model", decay: 1, weights: { default: 1 } },
    centroidEmbedding: null,
    observationCount: 3,
    state: overrides.state ?? "active",
    mergedIntoClusterId: null,
    firstObservedAt: at,
    lastObservedAt: at,
    clusteredAt: at,
  })
}

const remainingIds = async () => {
  const rows = await pg.db.select().from(taxonomyClusters)
  return rows.map((row) => row.id).sort()
}

describe("TaxonomyClusterRepositoryLive.deleteByBehavior", () => {
  beforeEach(async () => {
    await pg.db.delete(taxonomyClusters)
  })

  it("drops the behavior's rows and leaves the global topic tree standing", async () => {
    await seedCluster({ id: "scoped-topic", customBehaviorId: BEHAVIOR })
    await seedCluster({ id: "global-topic", customBehaviorId: null })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* TaxonomyClusterRepository
        yield* repo.deleteByBehavior({ projectId: PROJECT, customBehaviorId: BEHAVIOR })
      }),
    )

    expect(await remainingIds()).toEqual([makeId("global-topic")])
  })

  it("drops every facet slice of the behavior, not just its topic one", async () => {
    await seedCluster({ id: "scoped-topic", customBehaviorId: BEHAVIOR })
    await seedCluster({ id: "scoped-facet", customBehaviorId: BEHAVIOR, facetId: FACET })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* TaxonomyClusterRepository
        yield* repo.deleteByBehavior({ projectId: PROJECT, customBehaviorId: BEHAVIOR })
      }),
    )

    expect(await remainingIds()).toEqual([])
  })

  it("leaves other behaviors and other projects alone", async () => {
    await seedCluster({ id: "target", customBehaviorId: BEHAVIOR })
    await seedCluster({ id: "sibling", customBehaviorId: OTHER_BEHAVIOR })
    await seedCluster({ id: "elsewhere", customBehaviorId: BEHAVIOR, projectId: OTHER_PROJECT })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* TaxonomyClusterRepository
        yield* repo.deleteByBehavior({ projectId: PROJECT, customBehaviorId: BEHAVIOR })
      }),
    )

    expect(await remainingIds()).toEqual([makeId("elsewhere"), makeId("sibling")].sort())
  })

  it("deletes staging rows too, unlike deleteStaging's inverse guard", async () => {
    await seedCluster({ id: "scoped-active", customBehaviorId: BEHAVIOR })
    await seedCluster({ id: "scoped-staging", customBehaviorId: BEHAVIOR, state: "staging" })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* TaxonomyClusterRepository
        yield* repo.deleteByBehavior({ projectId: PROJECT, customBehaviorId: BEHAVIOR })
      }),
    )

    expect(await remainingIds()).toEqual([])
  })
})
