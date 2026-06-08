import {
  type ChSqlClient,
  OrganizationId,
  ProjectId,
  SessionId,
  TaxonomyClusterId,
  TaxonomyRunId,
} from "@domain/shared"
import {
  TAXONOMY_OBSERVATION_RETENTION_DAYS,
  type TaxonomyMomentObservation,
  TaxonomyObservationRepository,
  TaxonomyProjectionMethod,
} from "@domain/taxonomy"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { TaxonomyObservationRepositoryLive } from "./taxonomy-observation-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const sessionId = SessionId("session-1")
const clusterId = TaxonomyClusterId("c".repeat(24))
const runId = TaxonomyRunId("r".repeat(24))
const now = new Date("2026-05-24T12:00:00.000Z")

const ch = setupTestClickHouse()

const makeObservation = (overrides: Partial<TaxonomyMomentObservation> = {}): TaxonomyMomentObservation => ({
  organizationId,
  projectId,
  observationId: "b".repeat(24),
  sessionId,
  analysisHash: "a".repeat(64),
  momentId: "moment-1",
  projectionMethod: TaxonomyProjectionMethod.MomentTextEmbedding,
  projectionHash: "d".repeat(64),
  projectionMetadata: { turnIndexes: [0, 2] },
  embedding: [1, 0, 0],
  assignedClusterId: null,
  assignmentConfidence: 0,
  assignmentMethod: "noise",
  reassignmentRunId: null,
  startTime: now,
  endTime: new Date("2026-05-24T12:01:00.000Z"),
  retentionDays: TAXONOMY_OBSERVATION_RETENTION_DAYS,
  indexedAt: now,
  ...overrides,
})

const runWithRepository = <A, E>(effect: Effect.Effect<A, E, TaxonomyObservationRepository | ChSqlClient>) =>
  Effect.runPromise(effect.pipe(withClickHouse(TaxonomyObservationRepositoryLive, ch.client, organizationId)))

describe("TaxonomyObservationRepositoryLive", () => {
  it("upserts moment-level observations and lists by session", async () => {
    const observation = makeObservation()

    const rows = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        yield* repo.upsert(observation)
        return yield* repo.listBySession({
          organizationId,
          projectId,
          sessionId,
          analysisHash: observation.analysisHash,
        })
      }),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.momentId).toBe("moment-1")
    expect(rows[0]?.projectionMetadata).toEqual({ turnIndexes: [0, 2] })
  })

  it("keeps noise and counts project-scoped", async () => {
    // Own project id: the single "topic" dimension no longer isolates this
    // test's rows from the ones inserted by earlier tests.
    const countsProjectId = ProjectId("c".repeat(24))
    const counts = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        yield* repo.upsert(makeObservation({ observationId: "n".repeat(24), projectId: countsProjectId }))
        yield* repo.upsert(
          makeObservation({
            observationId: "a".repeat(24),
            projectId: countsProjectId,
            projectionMethod: TaxonomyProjectionMethod.MomentTextEmbedding,
            projectionHash: "e".repeat(64),
          }),
        )
        yield* repo.upsert(
          makeObservation({
            observationId: "z".repeat(24),
            projectId: countsProjectId,
            assignedClusterId: clusterId,
            assignmentMethod: "centroid_online",
            assignmentConfidence: 0.91,
          }),
        )
        return yield* repo.getCounts({
          organizationId,
          projectId: countsProjectId,
          since: new Date("2026-05-23T00:00:00.000Z"),
        })
      }),
    )

    expect(counts).toEqual({ total: 3, assigned: 1, noise: 2 })
  })

  it("rewrites observations for reassignment and lists by dimension and cluster", async () => {
    const observation = makeObservation({ observationId: "r".repeat(24), sessionId: SessionId("reassigned-session") })

    const rows = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        yield* repo.upsert(observation)
        yield* repo.reassignMany([
          {
            observation,
            assignedClusterId: clusterId,
            assignmentMethod: "gardening_reassign",
            assignmentConfidence: 0.82,
            reassignmentRunId: runId,
            indexedAt: new Date("2026-05-24T12:02:00.000Z"),
          },
        ])
        return yield* repo.listByCluster({
          organizationId,
          projectId,
          clusterId,
          limit: 10,
        })
      }),
    )

    expect(rows.map((row) => row.observationId)).toEqual([observation.observationId])
    expect(rows[0]?.assignmentMethod).toBe("gardening_reassign")
    expect(rows[0]?.reassignmentRunId).toBe(runId)
  })

  it("treats reassignment as one current observation", async () => {
    const observation = makeObservation({ observationId: "u".repeat(24), sessionId: SessionId("current-session") })

    const result = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* TaxonomyObservationRepository
        yield* repo.upsert(observation)
        yield* repo.reassignMany([
          {
            observation,
            assignedClusterId: clusterId,
            assignmentMethod: "gardening_reassign",
            assignmentConfidence: 0.82,
            reassignmentRunId: runId,
            indexedAt: new Date("2026-05-24T12:02:00.000Z"),
          },
        ])
        const counts = yield* repo.getCounts({
          organizationId,
          projectId,
          since: new Date("2026-05-23T00:00:00.000Z"),
        })
        const noise = yield* repo.listNoise({
          organizationId,
          projectId,
          since: new Date("2026-05-23T00:00:00.000Z"),
        })
        const assignments = yield* repo.getClusterAssignmentCounts({
          organizationId,
          projectId,
          clusterIds: [clusterId],
        })
        return { counts, noise, assignments }
      }),
    )

    expect(result.counts).toEqual({ total: 1, assigned: 1, noise: 0 })
    expect(result.noise).toHaveLength(0)
    expect(result.assignments).toMatchObject([{ clusterId, count: 1 }])
  })
})
