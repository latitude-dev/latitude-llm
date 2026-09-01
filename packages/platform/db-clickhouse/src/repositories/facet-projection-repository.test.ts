import { type ChSqlClient, FacetId, OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { FacetProjectionRepository, type TaxonomyFacetProjection } from "@domain/taxonomy"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { FacetProjectionRepositoryLive } from "./facet-projection-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const facetId = FacetId("f".repeat(24))
const otherFacetId = FacetId("g".repeat(24))
const now = new Date("2026-06-01T12:00:00.000Z")

const ch = setupTestClickHouse()

const run = <A, E>(effect: Effect.Effect<A, E, FacetProjectionRepository | ChSqlClient>) =>
  Effect.runPromise(effect.pipe(withClickHouse(FacetProjectionRepositoryLive, ch.client, organizationId)))

let seq = 0
const makeProjection = (overrides: Partial<TaxonomyFacetProjection> = {}): TaxonomyFacetProjection => {
  seq += 1
  return {
    organizationId,
    projectId,
    facetId,
    sessionObservationId: `obs${seq}`.padEnd(24, "0"),
    sessionId: SessionId(`session-${seq}`),
    extractedText: "the user wants to cancel their subscription",
    analysisHash: "a".repeat(64),
    embedding: [1, 0, 0],
    startTime: now,
    retentionDays: 30,
    indexedAt: now,
    ...overrides,
  }
}

describe("FacetProjectionRepositoryLive", () => {
  it("upserts projections and looks them up by session observation id", async () => {
    const a = makeProjection({ sessionObservationId: "obs-a".padEnd(24, "0") })
    const b = makeProjection({ sessionObservationId: "obs-b".padEnd(24, "0") })

    const found = await run(
      Effect.gen(function* () {
        const repo = yield* FacetProjectionRepository
        yield* repo.upsertMany([a, b])
        return yield* repo.listBySessionObservationIds({
          organizationId,
          projectId,
          facetId,
          sessionObservationIds: [a.sessionObservationId, b.sessionObservationId, "missing".padEnd(24, "0")],
        })
      }),
    )

    expect(found.map((p) => p.sessionObservationId).sort()).toEqual(
      [a.sessionObservationId, b.sessionObservationId].sort(),
    )
    const roundTripped = found.find((p) => p.sessionObservationId === a.sessionObservationId)
    expect(roundTripped?.extractedText).toBe(a.extractedText)
    expect(roundTripped?.embedding).toEqual([1, 0, 0])
    expect(roundTripped?.analysisHash).toBe("a".repeat(64))
  })

  it("returns [] for an empty id list without querying", async () => {
    const found = await run(
      Effect.gen(function* () {
        const repo = yield* FacetProjectionRepository
        return yield* repo.listBySessionObservationIds({
          organizationId,
          projectId,
          facetId,
          sessionObservationIds: [],
        })
      }),
    )
    expect(found).toEqual([])
  })

  it("replaces a row on re-upsert of the same (facet, session) key (ReplacingMergeTree FINAL)", async () => {
    const sessionObservationId = "obs-dup".padEnd(24, "0")
    const found = await run(
      Effect.gen(function* () {
        const repo = yield* FacetProjectionRepository
        yield* repo.upsertMany([makeProjection({ sessionObservationId, extractedText: "old answer", indexedAt: now })])
        yield* repo.upsertMany([
          makeProjection({
            sessionObservationId,
            extractedText: "new answer",
            indexedAt: new Date("2026-06-01T13:00:00.000Z"),
          }),
        ])
        return yield* repo.listBySessionObservationIds({
          organizationId,
          projectId,
          facetId,
          sessionObservationIds: [sessionObservationId],
        })
      }),
    )
    expect(found).toHaveLength(1)
    expect(found[0]?.extractedText).toBe("new answer")
  })

  it("persists unclear answers as empty extracted_text with no embedding", async () => {
    const sessionObservationId = "obs-unclear".padEnd(24, "0")
    const found = await run(
      Effect.gen(function* () {
        const repo = yield* FacetProjectionRepository
        yield* repo.upsertMany([makeProjection({ sessionObservationId, extractedText: "", embedding: [] })])
        return yield* repo.listBySessionObservationIds({
          organizationId,
          projectId,
          facetId,
          sessionObservationIds: [sessionObservationId],
        })
      }),
    )
    expect(found).toHaveLength(1)
    expect(found[0]?.extractedText).toBe("")
    expect(found[0]?.embedding).toEqual([])
  })

  it("isolates projections by facet even when the session observation id is shared", async () => {
    const sessionObservationId = "obs-shared".padEnd(24, "0")
    const found = await run(
      Effect.gen(function* () {
        const repo = yield* FacetProjectionRepository
        yield* repo.upsertMany([
          makeProjection({ sessionObservationId, facetId, extractedText: "facet A answer" }),
          makeProjection({ sessionObservationId, facetId: otherFacetId, extractedText: "facet B answer" }),
        ])
        return yield* repo.listBySessionObservationIds({
          organizationId,
          projectId,
          facetId,
          sessionObservationIds: [sessionObservationId],
        })
      }),
    )
    expect(found).toHaveLength(1)
    expect(found[0]?.extractedText).toBe("facet A answer")
  })

  it("lists the whole cached window for routing, newest first, skipping unclear rows and other facets", async () => {
    const older = new Date("2026-05-01T00:00:00.000Z")
    const window = await run(
      Effect.gen(function* () {
        const repo = yield* FacetProjectionRepository
        yield* repo.upsertMany([
          makeProjection({ sessionObservationId: "obs-new".padEnd(24, "0"), startTime: now }),
          makeProjection({ sessionObservationId: "obs-old".padEnd(24, "0"), startTime: older }),
          // Unclear: no embedding, so there is nothing to route it by.
          makeProjection({ sessionObservationId: "obs-unclr".padEnd(24, "0"), extractedText: "", embedding: [] }),
          makeProjection({ sessionObservationId: "obs-other".padEnd(24, "0"), facetId: otherFacetId }),
        ])
        return yield* repo.listWindowForReassignment({ organizationId, projectId, facetId, limit: 10 })
      }),
    )

    // The window is the cumulative extraction cache — this is what makes a lens's
    // coverage accumulate instead of tracking the latest sample window.
    expect(window.map((row) => row.observationId)).toEqual(["obs-new".padEnd(24, "0"), "obs-old".padEnd(24, "0")])
    expect(window[0]?.embedding).toEqual([1, 0, 0])
    expect(window[1]?.startTime).toEqual(older)
    expect(window[0]?.sessionId).toMatch(/^session-/)
  })

  it("purges only the given facet's slice on deleteByFacet", async () => {
    const [mine, theirs] = await run(
      Effect.gen(function* () {
        const repo = yield* FacetProjectionRepository
        const a = makeProjection({ sessionObservationId: "obs-mine".padEnd(24, "0"), facetId })
        const b = makeProjection({ sessionObservationId: "obs-theirs".padEnd(24, "0"), facetId: otherFacetId })
        yield* repo.upsertMany([a, b])
        yield* repo.deleteByFacet({ organizationId, projectId, facetId })
        return [
          yield* repo.listBySessionObservationIds({
            organizationId,
            projectId,
            facetId,
            sessionObservationIds: [a.sessionObservationId],
          }),
          yield* repo.listBySessionObservationIds({
            organizationId,
            projectId,
            facetId: otherFacetId,
            sessionObservationIds: [b.sessionObservationId],
          }),
        ] as const
      }),
    )
    expect(mine).toHaveLength(0)
    expect(theirs).toHaveLength(1)
  })
})
