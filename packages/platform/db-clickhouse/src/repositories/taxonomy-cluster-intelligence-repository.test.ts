import { type ChSqlClient, CustomBehaviorId, OrganizationId, ProjectId, TaxonomyClusterId } from "@domain/shared"
import { TaxonomyClusterIntelligenceRepository } from "@domain/taxonomy"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { TaxonomyClusterIntelligenceRepositoryLive } from "./taxonomy-cluster-intelligence-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const clusterId = TaxonomyClusterId("c".repeat(24))
const customBehaviorId = CustomBehaviorId("b".repeat(24))
const scopedClusterId = TaxonomyClusterId("s".repeat(24))
const otherClusterId = TaxonomyClusterId("x".repeat(24))
const analysisHash = "a".repeat(64)
const ts = "2026-05-24 12:00:00.000000000"

const traceIdFor = (n: number) => `${n}`.padStart(32, "t")

const insertObservation = (sessionId: string, times: { startTime?: string; endTime?: string } = {}) =>
  ch.client.insert({
    table: "taxonomy_observations",
    values: [
      {
        organization_id: organizationId as string,
        project_id: projectId as string,
        observation_id: `obs-${sessionId}`,
        session_id: sessionId,
        analysis_hash: analysisHash,
        moment_id: `moment-${sessionId}`,
        projection_method: "session_user_intent_embedding",
        projection_hash: "d".repeat(64),
        projection_metadata: JSON.stringify({ summary: `summary ${sessionId}` }),
        embedding: [1, 0, 0],
        assigned_cluster_id: clusterId as string,
        assignment_confidence: 1,
        assignment_method: "gardening_reassign",
        start_time: times.startTime ?? ts,
        end_time: times.endTime ?? ts,
      },
    ],
    format: "JSONEachRow",
  })

const insertAnalysis = (sessionId: string, traceIds: string[]) =>
  ch.client.insert({
    table: "session_analyses",
    values: [
      {
        organization_id: organizationId as string,
        project_id: projectId as string,
        session_id: sessionId,
        start_time: ts,
        end_time: ts,
        trace_ids: traceIds,
        analysis_hash: analysisHash,
        analysis_status: "analyzed",
      },
    ],
    format: "JSONEachRow",
  })

const insertMomentLabel = (sessionId: string, kind: string, firstMessageIndex: number) =>
  ch.client.insert({
    table: "session_moment_labels",
    values: [
      {
        organization_id: organizationId as string,
        project_id: projectId as string,
        session_id: sessionId,
        analysis_hash: analysisHash,
        label_id: `label-${sessionId}-${kind}`,
        moment_id: `moment-${sessionId}`,
        kind,
        actor: "assistant",
        first_message_index: firstMessageIndex,
        last_message_index: firstMessageIndex,
        evidence: "",
      },
    ],
    format: "JSONEachRow",
  })

// An observation whose GLOBAL assigned_cluster_id is deliberately NOT the
// scoped cluster, so a scoped read that still finds it proves it resolved
// membership from taxonomy_view_assignments rather than assigned_cluster_id.
const insertObservationAssignedElsewhere = (sessionId: string) =>
  ch.client.insert({
    table: "taxonomy_observations",
    values: [
      {
        organization_id: organizationId as string,
        project_id: projectId as string,
        observation_id: `obs-${sessionId}`,
        session_id: sessionId,
        analysis_hash: analysisHash,
        moment_id: `moment-${sessionId}`,
        projection_method: "session_user_intent_embedding",
        projection_hash: "d".repeat(64),
        projection_metadata: JSON.stringify({ summary: `summary ${sessionId}` }),
        embedding: [1, 0, 0],
        assigned_cluster_id: otherClusterId as string,
        assignment_confidence: 1,
        assignment_method: "gardening_reassign",
        start_time: ts,
        end_time: ts,
      },
    ],
    format: "JSONEachRow",
  })

const insertTaxonomyViewAssignment = (sessionId: string) =>
  ch.client.insert({
    table: "taxonomy_view_assignments",
    values: [
      {
        organization_id: organizationId as string,
        project_id: projectId as string,
        custom_behavior_id: customBehaviorId as string,
        observation_id: `obs-${sessionId}`,
        session_id: sessionId,
        assigned_cluster_id: scopedClusterId as string,
        start_time: ts,
      },
    ],
    format: "JSONEachRow",
  })

const ch = setupTestClickHouse()

const run = <A, E>(effect: Effect.Effect<A, E, TaxonomyClusterIntelligenceRepository | ChSqlClient>) =>
  Effect.runPromise(effect.pipe(withClickHouse(TaxonomyClusterIntelligenceRepositoryLive, ch.client, organizationId)))

const listTraceIds = (input: { filter: string; momentRange?: { metric: string; fromTurn: number; toTurn: number } }) =>
  run(
    Effect.gen(function* () {
      const repo = yield* TaxonomyClusterIntelligenceRepository
      return yield* repo.listSessionTraceIds({
        organizationId,
        projectId,
        clusterIds: [clusterId],
        filter: input.filter,
        ...(input.momentRange ? { momentRange: input.momentRange } : {}),
        limit: 100,
      })
    }),
  )

const runList = (overrides: {
  clusterIds?: readonly TaxonomyClusterId[]
  filter?: string
  startTimeFrom?: Date
  startTimeTo?: Date
  limit?: number
}) =>
  run(
    Effect.gen(function* () {
      const repo = yield* TaxonomyClusterIntelligenceRepository
      return yield* repo.listSessionTraceIds({
        organizationId,
        projectId,
        clusterIds: overrides.clusterIds ?? [clusterId],
        filter: overrides.filter ?? "all",
        ...(overrides.startTimeFrom ? { startTimeFrom: overrides.startTimeFrom } : {}),
        ...(overrides.startTimeTo ? { startTimeTo: overrides.startTimeTo } : {}),
        limit: overrides.limit ?? 100,
      })
    }),
  )

describe("TaxonomyClusterIntelligenceRepository.listSessionTraceIds", () => {
  it("returns one trace id per session and filters by moment kind / turn range", async () => {
    await insertObservation("escalated")
    await insertAnalysis("escalated", [traceIdFor(1)])
    await insertMomentLabel("escalated", "escalation", 3)

    await insertObservation("resolved")
    await insertAnalysis("resolved", [traceIdFor(2)])
    await insertMomentLabel("resolved", "resolution", 1)

    expect([...(await listTraceIds({ filter: "all" }))].sort()).toEqual([traceIdFor(1), traceIdFor(2)].sort())
    expect(await listTraceIds({ filter: "escalation" })).toEqual([traceIdFor(1)])
    expect(await listTraceIds({ filter: "resolution" })).toEqual([traceIdFor(2)])

    // Turn range narrows to escalation moments within the window only.
    expect(
      await listTraceIds({ filter: "all", momentRange: { metric: "escalation", fromTurn: 0, toTurn: 5 } }),
    ).toEqual([traceIdFor(1)])
    expect(
      await listTraceIds({ filter: "all", momentRange: { metric: "escalation", fromTurn: 10, toTurn: 20 } }),
    ).toEqual([])
  })

  it("skips sessions whose analysis carries no trace id", async () => {
    await insertObservation("no-trace")
    await insertAnalysis("no-trace", [])
    await insertMomentLabel("no-trace", "escalation", 1)

    expect(await listTraceIds({ filter: "all" })).toEqual([])
  })

  it("caps results at the limit, newest-first by end time", async () => {
    await insertObservation("older", { endTime: "2026-05-24 10:00:00.000000000" })
    await insertAnalysis("older", [traceIdFor(1)])
    await insertObservation("newer", { endTime: "2026-05-24 14:00:00.000000000" })
    await insertAnalysis("newer", [traceIdFor(2)])

    // limit caps the set; the web layer passes MAX+1 to detect overflow.
    expect(await runList({ limit: 1 })).toEqual([traceIdFor(2)])
    expect(await runList({ limit: 100 })).toEqual([traceIdFor(2), traceIdFor(1)])
  })

  it("filters by the start-time window", async () => {
    await insertObservation("early", { startTime: "2026-05-10 12:00:00.000000000" })
    await insertAnalysis("early", [traceIdFor(1)])
    await insertObservation("late", { startTime: "2026-05-24 12:00:00.000000000" })
    await insertAnalysis("late", [traceIdFor(2)])

    expect(await runList({ startTimeFrom: new Date("2026-05-20T00:00:00.000Z") })).toEqual([traceIdFor(2)])
    expect(await runList({ startTimeTo: new Date("2026-05-20T00:00:00.000Z") })).toEqual([traceIdFor(1)])
  })

  it("returns [] for an empty cluster id list without querying", async () => {
    await insertObservation("any")
    await insertAnalysis("any", [traceIdFor(1)])

    expect(await runList({ clusterIds: [] })).toEqual([])
  })
})

describe("TaxonomyClusterIntelligenceRepository scoped custom-behavior reads", () => {
  it("resolves membership from the assignment slice, not the global assigned_cluster_id", async () => {
    await insertObservationAssignedElsewhere("scoped")
    await insertAnalysis("scoped", [traceIdFor(7)])
    await insertTaxonomyViewAssignment("scoped")

    const scoped = await run(
      Effect.gen(function* () {
        const repo = yield* TaxonomyClusterIntelligenceRepository
        return yield* repo.listSessionTraceIds({
          organizationId,
          projectId,
          clusterIds: [scopedClusterId],
          filter: "all",
          limit: 100,
          customBehaviorId,
        })
      }),
    )
    expect(scoped).toEqual([traceIdFor(7)])

    // The same scoped cluster id resolves to nothing on the global path, because
    // no observation carries it in assigned_cluster_id.
    const global = await runList({ clusterIds: [scopedClusterId] })
    expect(global).toEqual([])

    // And the scoped aggregate reads the slice's sessions too (global would be 0).
    const aggregate = await run(
      Effect.gen(function* () {
        const repo = yield* TaxonomyClusterIntelligenceRepository
        return yield* repo.getClusterAggregate({
          organizationId,
          projectId,
          clusterIds: [scopedClusterId],
          sourceWindowStart: new Date("2026-05-01T00:00:00.000Z"),
          sourceWindowEnd: new Date("2026-06-01T00:00:00.000Z"),
          customBehaviorId,
        })
      }),
    )
    expect(aggregate.sourceSessionCount).toBe(1)
  })
})

describe("TaxonomyClusterIntelligenceRepository.listClusterSessions", () => {
  const listSessions = (overrides: {
    clusterIds?: readonly TaxonomyClusterId[]
    filter?: string
    offset?: number
    limit?: number
    customBehaviorId?: CustomBehaviorId
  }) =>
    run(
      Effect.gen(function* () {
        const repo = yield* TaxonomyClusterIntelligenceRepository
        return yield* repo.listClusterSessions({
          organizationId,
          projectId,
          clusterIds: overrides.clusterIds ?? [clusterId],
          filter: overrides.filter ?? "all",
          offset: overrides.offset ?? 0,
          limit: overrides.limit ?? 50,
          ...(overrides.customBehaviorId ? { customBehaviorId: overrides.customBehaviorId } : {}),
        })
      }),
    )

  it("returns filtered sessions with a histogram and paginates", async () => {
    await insertObservation("escalated")
    await insertAnalysis("escalated", [traceIdFor(1)])
    await insertMomentLabel("escalated", "escalation", 3)
    await insertObservation("resolved")
    await insertAnalysis("resolved", [traceIdFor(2)])
    await insertMomentLabel("resolved", "resolution", 1)

    const all = await listSessions({})
    expect([...all.sessions.map((session) => session.sessionId)].sort()).toEqual(["escalated", "resolved"])
    expect(all.sessions.every((session) => session.startTime instanceof Date)).toBe(true)
    expect(all.histogram.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(2)
    expect(all.hasMore).toBe(false)

    expect((await listSessions({ filter: "escalation" })).sessions.map((session) => session.sessionId)).toEqual([
      "escalated",
    ])

    const page = await listSessions({ limit: 1 })
    expect(page.sessions).toHaveLength(1)
    expect(page.hasMore).toBe(true)
    expect(page.nextOffset).toBe(1)
  })

  it("reads the scoped slice when customBehaviorId is set", async () => {
    await insertObservationAssignedElsewhere("scoped")
    await insertAnalysis("scoped", [traceIdFor(9)])
    await insertTaxonomyViewAssignment("scoped")

    const scoped = await listSessions({ clusterIds: [scopedClusterId], customBehaviorId })
    expect(scoped.sessions.map((session) => session.sessionId)).toEqual(["scoped"])

    // The same scoped cluster id resolves to nothing on the global path.
    expect((await listSessions({ clusterIds: [scopedClusterId] })).sessions).toEqual([])
  })
})

describe("TaxonomyClusterIntelligenceRepository.getClusterTrajectory", () => {
  it("buckets moment-metric counts by turn", async () => {
    await insertObservation("s1")
    await insertAnalysis("s1", [traceIdFor(1)])
    await insertMomentLabel("s1", "escalation", 3)
    await insertObservation("s2")
    await insertAnalysis("s2", [traceIdFor(2)])
    await insertMomentLabel("s2", "resolution", 5)

    const rows = await run(
      Effect.gen(function* () {
        const repo = yield* TaxonomyClusterIntelligenceRepository
        return yield* repo.getClusterTrajectory({ organizationId, projectId, clusterIds: [clusterId], axis: "turn" })
      }),
    )
    const byBucket = Object.fromEntries(rows.map((row) => [row.bucket, row]))
    expect(byBucket["3"]?.escalation).toBe(1)
    expect(byBucket["5"]?.resolution).toBe(1)
    expect(rows.reduce((sum, row) => sum + row.frequency, 0)).toBe(2)
  })
})
