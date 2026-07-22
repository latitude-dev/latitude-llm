import { ChSqlClient, FacetId, OrganizationId, ProjectId, SessionId, SqlClient } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createFakeFacetProjectionRepository } from "../testing/fake-facet-projection-repository.ts"
import { createFakeFacetRepository } from "../testing/fake-facet-repository.ts"
import { type TaxonomyFacet, taxonomyFacetSchema } from "./facet.ts"
import { type TaxonomyFacetProjection, taxonomyFacetProjectionSchema } from "./facet-projection.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const facetId = FacetId("f".repeat(24))
const now = new Date("2026-07-22T12:00:00.000Z")

const run = <A, E>(effect: Effect.Effect<A, E, SqlClient | ChSqlClient>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
    ),
  )

const makeFacet = (overrides: Partial<TaxonomyFacet> = {}): TaxonomyFacet =>
  taxonomyFacetSchema.parse({
    id: facetId,
    organizationId,
    projectId,
    slug: "user-goal",
    name: "Apparent user goal",
    description: "Clusters sessions by what the user was trying to accomplish, surfacing the top goals and unmet ones.",
    instructions: "In one sentence, what was the end user ultimately trying to accomplish? Ignore pleasantries.",
    status: "pending",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  })

const makeProjection = (overrides: Partial<TaxonomyFacetProjection> = {}): TaxonomyFacetProjection =>
  taxonomyFacetProjectionSchema.parse({
    organizationId,
    projectId,
    facetId,
    sessionObservationId: "obs".padEnd(24, "0"),
    sessionId: SessionId("session-1"),
    extractedText: "renew an expired subscription",
    analysisHash: "a".repeat(64),
    embedding: [1, 0, 0],
    startTime: now,
    retentionDays: 90,
    indexedAt: now,
    ...overrides,
  })

describe("TaxonomyFacet contracts", () => {
  it("round-trips a facet through the CRUD fake and resolves it by slug", async () => {
    const { repository, rows, gardenedAt } = createFakeFacetRepository()
    const gardenedTime = new Date("2026-07-22T18:00:00.000Z")

    const [found, bySlug] = await run(
      Effect.gen(function* () {
        yield* repository.save(makeFacet())
        yield* repository.markGardened({ id: facetId, gardenedAt: gardenedTime })
        return [
          yield* repository.findById(facetId),
          yield* repository.findBySlug({ projectId, slug: "user-goal" }),
        ] as const
      }),
    )

    expect(found.name).toBe("Apparent user goal")
    expect(bySlug?.id).toBe(facetId)
    expect(await run(repository.countByProject({ projectId }))).toBe(1)
    expect(gardenedAt.get(facetId)).toEqual(gardenedTime)
    expect(rows.size).toBe(1)
  })

  it("rejects a second facet reusing a slug in the same project (unique per project)", async () => {
    const { repository } = createFakeFacetRepository([makeFacet()])
    const exit = await Effect.runPromiseExit(
      repository
        .save(makeFacet({ id: FacetId("g".repeat(24)), slug: "user-goal" }))
        .pipe(Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient()))),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })
})

describe("TaxonomyFacetProjection fake", () => {
  it("replaces on re-upsert of the same (facet, session) key — ReplacingMergeTree semantics", async () => {
    const { repository, rows } = createFakeFacetProjectionRepository()
    const sessionObservationId = "obs".padEnd(24, "0")

    await run(repository.upsertMany([makeProjection({ sessionObservationId, extractedText: "first" })]))
    await run(repository.upsertMany([makeProjection({ sessionObservationId, extractedText: "second" })]))

    expect(rows.size).toBe(1)
    expect([...rows.values()][0]?.extractedText).toBe("second")
  })

  it("cache lookup returns only the requested sessions for the facet", async () => {
    const { repository } = createFakeFacetProjectionRepository([
      makeProjection({ sessionObservationId: "hit".padEnd(24, "0") }),
      makeProjection({ sessionObservationId: "other".padEnd(24, "0") }),
    ])

    const hits = await run(
      repository.listBySessionObservationIds({
        organizationId,
        projectId,
        facetId,
        sessionObservationIds: ["hit".padEnd(24, "0"), "missing".padEnd(24, "0")],
      }),
    )

    expect(hits.map((row) => row.sessionObservationId)).toEqual(["hit".padEnd(24, "0")])
  })

  it("purges a facet's slice on deleteByFacet", async () => {
    const { repository, rows } = createFakeFacetProjectionRepository([makeProjection()])
    await run(repository.deleteByFacet({ organizationId, projectId, facetId }))
    expect(rows.size).toBe(0)
  })
})
