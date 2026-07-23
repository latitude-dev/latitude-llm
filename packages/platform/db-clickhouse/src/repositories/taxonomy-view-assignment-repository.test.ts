import {
  type ChSqlClient,
  CustomBehaviorId,
  FacetId,
  OrganizationId,
  ProjectId,
  SessionId,
  TaxonomyClusterId,
} from "@domain/shared"
import { type TaxonomyViewAssignment, TaxonomyViewAssignmentRepository } from "@domain/taxonomy"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { TaxonomyViewAssignmentRepositoryLive } from "./taxonomy-view-assignment-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const customBehaviorId = CustomBehaviorId("b".repeat(24))
const otherBehaviorId = CustomBehaviorId("c".repeat(24))
const facetId = FacetId("f".repeat(24))
const clusterA = TaxonomyClusterId("a".repeat(24))
const clusterB = TaxonomyClusterId("d".repeat(24))
const now = new Date("2026-06-01T12:00:00.000Z")

const ch = setupTestClickHouse()

const run = <A, E>(effect: Effect.Effect<A, E, TaxonomyViewAssignmentRepository | ChSqlClient>) =>
  Effect.runPromise(effect.pipe(withClickHouse(TaxonomyViewAssignmentRepositoryLive, ch.client, organizationId)))

let seq = 0
const makeAssignment = (overrides: Partial<TaxonomyViewAssignment> = {}): TaxonomyViewAssignment => {
  seq += 1
  return {
    organizationId,
    projectId,
    customBehaviorId,
    facetId: null,
    observationId: `obs${seq}`.padEnd(24, "0"),
    sessionId: SessionId(`session-${seq}`),
    assignedClusterId: clusterA,
    assignmentConfidence: 0.9,
    assignmentMethod: "gardening_birth",
    reassignmentRunId: null,
    startTime: now,
    retentionDays: 90,
    indexedAt: now,
    ...overrides,
  }
}

const toCh = (date: Date) => date.toISOString().replace("Z", "")

const makeObservationRow = (observationId: string, startTime: Date, summary: string) => ({
  organization_id: organizationId as string,
  project_id: projectId as string,
  observation_id: observationId,
  session_id: "session-x",
  analysis_hash: "a".repeat(64),
  moment_id: "moment-1",
  projection_method: "moment_text_embedding",
  projection_hash: "e".repeat(64),
  projection_metadata: JSON.stringify({ summary }),
  embedding: [1, 0, 0],
  assigned_cluster_id: "",
  assignment_confidence: 0,
  assignment_method: "noise",
  reassignment_run_id: "",
  start_time: toCh(startTime),
  end_time: toCh(startTime),
  retention_days: 90,
  indexed_at: toCh(startTime),
})

describe("TaxonomyViewAssignmentRepositoryLive", () => {
  it("upserts assignments and lists them by behavior, newest first", async () => {
    const older = makeAssignment({
      observationId: "obs-old".padEnd(24, "0"),
      startTime: new Date("2026-06-01T10:00:00.000Z"),
    })
    const newer = makeAssignment({
      observationId: "obs-new".padEnd(24, "0"),
      startTime: new Date("2026-06-01T11:00:00.000Z"),
    })

    const listed = await run(
      Effect.gen(function* () {
        const repo = yield* TaxonomyViewAssignmentRepository
        yield* repo.upsertMany([older, newer])
        return yield* repo.listByBehavior({ organizationId, projectId, customBehaviorId, limit: 100 })
      }),
    )

    expect(listed.map((a) => a.observationId)).toEqual(["obs-new".padEnd(24, "0"), "obs-old".padEnd(24, "0")])
    expect(listed[0]?.assignedClusterId).toBe(clusterA)
    expect(listed[0]?.assignmentConfidence).toBeCloseTo(0.9)
  })

  it("replaces a row on re-upsert of the same observation (ReplacingMergeTree FINAL)", async () => {
    const observationId = "obs-dup".padEnd(24, "0")
    const listed = await run(
      Effect.gen(function* () {
        const repo = yield* TaxonomyViewAssignmentRepository
        yield* repo.upsertMany([
          makeAssignment({
            observationId,
            assignedClusterId: clusterA,
            indexedAt: new Date("2026-06-01T12:00:00.000Z"),
          }),
        ])
        yield* repo.upsertMany([
          makeAssignment({
            observationId,
            assignedClusterId: clusterB,
            indexedAt: new Date("2026-06-01T13:00:00.000Z"),
          }),
        ])
        return yield* repo.listByBehavior({ organizationId, projectId, customBehaviorId, limit: 100 })
      }),
    )
    expect(listed).toHaveLength(1)
    expect(listed[0]?.assignedClusterId).toBe(clusterB)
  })

  it("counts assignments per cluster and excludes noise", async () => {
    const counts = await run(
      Effect.gen(function* () {
        const repo = yield* TaxonomyViewAssignmentRepository
        yield* repo.upsertMany([
          makeAssignment({ observationId: "o1".padEnd(24, "0"), assignedClusterId: clusterA }),
          makeAssignment({ observationId: "o2".padEnd(24, "0"), assignedClusterId: clusterA }),
          makeAssignment({ observationId: "o3".padEnd(24, "0"), assignedClusterId: clusterB }),
          makeAssignment({ observationId: "o4".padEnd(24, "0"), assignedClusterId: null }),
        ])
        return yield* repo.getClusterAssignmentCounts({ organizationId, projectId, customBehaviorId })
      }),
    )
    expect(counts).toEqual([
      { clusterId: clusterA, count: 2 },
      { clusterId: clusterB, count: 1 },
    ])
  })

  it("scopes reads to the given custom behavior", async () => {
    const listed = await run(
      Effect.gen(function* () {
        const repo = yield* TaxonomyViewAssignmentRepository
        yield* repo.upsertMany([
          makeAssignment({ observationId: "mine".padEnd(24, "0"), customBehaviorId }),
          makeAssignment({ observationId: "theirs".padEnd(24, "0"), customBehaviorId: otherBehaviorId }),
        ])
        return yield* repo.listByBehavior({ organizationId, projectId, customBehaviorId, limit: 100 })
      }),
    )
    expect(listed.map((a) => a.observationId)).toEqual(["mine".padEnd(24, "0")])
  })

  it("keeps topic reads isolated from facet edges on the same table", async () => {
    const [listed, counts] = await run(
      Effect.gen(function* () {
        const repo = yield* TaxonomyViewAssignmentRepository
        yield* repo.upsertMany([
          makeAssignment({ observationId: "topic".padEnd(24, "0"), facetId: null }),
          // Same scope + cluster but a facet lens — a different projection space
          // that topic reads (facet_id = '') must never surface.
          makeAssignment({ observationId: "facetrow".padEnd(24, "0"), facetId }),
        ])
        return [
          yield* repo.listByBehavior({ organizationId, projectId, customBehaviorId, limit: 100 }),
          yield* repo.getClusterAssignmentCounts({ organizationId, projectId, customBehaviorId }),
        ] as const
      }),
    )
    expect(listed.map((a) => a.observationId)).toEqual(["topic".padEnd(24, "0")])
    expect(counts).toEqual([{ clusterId: clusterA, count: 1 }])
  })

  it("purges a behavior's slice on deleteByBehavior", async () => {
    const listed = await run(
      Effect.gen(function* () {
        const repo = yield* TaxonomyViewAssignmentRepository
        yield* repo.upsertMany([makeAssignment(), makeAssignment()])
        yield* repo.deleteByBehavior({ organizationId, projectId, customBehaviorId })
        return yield* repo.listByBehavior({ organizationId, projectId, customBehaviorId, limit: 100 })
      }),
    )
    expect(listed).toHaveLength(0)
  })

  it("lists a scoped cluster's member observations by joining back to global taxonomy_observations", async () => {
    const m1 = "m1".padEnd(24, "0")
    const m2 = "m2".padEnd(24, "0")
    const m3 = "m3".padEnd(24, "0")
    const m4 = "m4".padEnd(24, "0")
    await ch.client.insert({
      table: "taxonomy_observations",
      values: [
        makeObservationRow(m1, new Date("2026-06-01T10:00:00.000Z"), "user asks about billing"),
        makeObservationRow(m2, new Date("2026-06-01T11:00:00.000Z"), "user asks about refunds"),
        makeObservationRow(m3, new Date("2026-06-01T09:00:00.000Z"), "user asks about shipping"),
        makeObservationRow(m4, new Date("2026-06-01T12:00:00.000Z"), "another behavior's observation"),
      ],
      format: "JSONEachRow",
    })

    const observations = await run(
      Effect.gen(function* () {
        const repo = yield* TaxonomyViewAssignmentRepository
        yield* repo.upsertMany([
          makeAssignment({ observationId: m1, assignedClusterId: clusterA }),
          makeAssignment({ observationId: m2, assignedClusterId: clusterA }),
          makeAssignment({ observationId: m3, assignedClusterId: clusterB }),
          makeAssignment({ observationId: m4, assignedClusterId: clusterA, customBehaviorId: otherBehaviorId }),
        ])
        return yield* repo.listClusterMemberObservations({
          organizationId,
          projectId,
          customBehaviorId,
          clusterId: clusterA,
          limit: 100,
        })
      }),
    )

    // Only clusterA members of THIS behavior, newest-first — excludes clusterB (m3)
    // and the other behavior's clusterA assignment (m4). The joined rows carry the
    // global observation's embedding + summary the naming step reads.
    expect(observations.map((o) => o.projectionMetadata.summary)).toEqual([
      "user asks about refunds",
      "user asks about billing",
    ])
    expect(observations[0]?.embedding).toEqual([1, 0, 0])
  })

  it("deleteByBehavior purges the cohort's edges across BOTH lenses (topic + facet)", async () => {
    const cb = CustomBehaviorId("del".padEnd(24, "0"))
    await run(
      Effect.gen(function* () {
        const repo = yield* TaxonomyViewAssignmentRepository
        yield* repo.upsertMany([
          makeAssignment({ observationId: "dt".padEnd(24, "0"), customBehaviorId: cb, facetId: null }),
          makeAssignment({ observationId: "df".padEnd(24, "0"), customBehaviorId: cb, facetId }),
        ])
        yield* repo.deleteByBehavior({ organizationId, projectId, customBehaviorId: cb })
      }),
    )
    // Count across ALL facet_ids for the behavior: the fix drops the `facet_id = ''`
    // filter so a facet-lens edge is purged with its cohort, never orphaned.
    const result = await ch.client.query({
      query: `SELECT count() AS c FROM taxonomy_view_assignments FINAL WHERE custom_behavior_id = {cb:String}`,
      query_params: { cb: cb as string },
      format: "JSONEachRow",
    })
    const [row] = await result.json<{ c: string | number }>()
    expect(Number(row?.c ?? -1)).toBe(0)
  })

  it("reads facet-lens cluster members from taxonomy_facet_projections (not taxonomy_observations)", async () => {
    const fp = "fp".padEnd(24, "0")
    await ch.client.insert({
      table: "taxonomy_facet_projections",
      values: [
        {
          organization_id: organizationId as string,
          project_id: projectId as string,
          facet_id: facetId as string,
          session_observation_id: fp,
          session_id: "session-fp",
          extracted_text: "the user wants to cancel a subscription",
          analysis_hash: "a".repeat(64),
          embedding: [0, 1, 0],
          start_time: toCh(now),
          retention_days: 90,
          indexed_at: toCh(now),
        },
      ],
      format: "JSONEachRow",
    })

    const members = await run(
      Effect.gen(function* () {
        const repo = yield* TaxonomyViewAssignmentRepository
        yield* repo.upsertMany([makeAssignment({ observationId: fp, assignedClusterId: clusterA, facetId })])
        return yield* repo.listClusterMemberObservations({
          organizationId,
          projectId,
          customBehaviorId,
          facetId,
          clusterId: clusterA,
          limit: 100,
        })
      }),
    )

    expect(members).toHaveLength(1)
    // The facet member's "summary" is its extracted one-sentence answer, and its
    // embedding is the facet-projection embedding — not the observation's.
    expect(members[0]?.projectionMetadata.summary).toBe("the user wants to cancel a subscription")
    expect(members[0]?.embedding).toEqual([0, 1, 0])
  })
})
