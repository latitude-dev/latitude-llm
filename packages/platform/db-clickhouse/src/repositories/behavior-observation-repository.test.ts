import {
  type ChSqlClient,
  OrganizationId,
  ProjectId,
  SessionId,
  TaxonomyClusterId,
  TaxonomyRunId,
  TraceId,
} from "@domain/shared"
import {
  BehaviorObservationRepository,
  TAXONOMY_EMBEDDING_MODEL,
  TAXONOMY_OBSERVATION_RETENTION_DAYS,
  type TaxonomyObservation,
} from "@domain/taxonomy"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { BehaviorObservationRepositoryLive } from "./behavior-observation-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const sessionId = SessionId("session-1")
const clusterId = TaxonomyClusterId("c".repeat(24))
const runId = TaxonomyRunId("r".repeat(24))
const now = new Date("2026-05-24T12:00:00.000Z")

const ch = setupTestClickHouse()

const makeObservation = (overrides: Partial<TaxonomyObservation> = {}): TaxonomyObservation => ({
  organizationId: organizationId,
  projectId: projectId,
  sessionId,
  startTime: now,
  endTime: new Date("2026-05-24T12:01:00.000Z"),
  traceIds: [TraceId("a".repeat(32))],
  summary: "User asks to cancel their account and the assistant explains cancellation steps.",
  summaryHash: "a".repeat(64),
  embedding: [1, 0, 0],
  embeddingModel: TAXONOMY_EMBEDDING_MODEL,
  assignedClusterId: null,
  assignmentConfidence: 0,
  assignmentMethod: "noise",
  reassignmentRunId: null,
  retentionDays: TAXONOMY_OBSERVATION_RETENTION_DAYS,
  indexedAt: now,
  ...overrides,
})

const runWithRepository = <A, E>(effect: Effect.Effect<A, E, BehaviorObservationRepository | ChSqlClient>) =>
  Effect.runPromise(effect.pipe(withClickHouse(BehaviorObservationRepositoryLive, ch.client, organizationId)))

describe("BehaviorObservationRepositoryLive", () => {
  it("upserts observations and finds them by session summary hash", async () => {
    const observation = makeObservation()

    const found = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* BehaviorObservationRepository
        yield* repo.upsert(observation)
        return yield* repo.findBySummaryHash({
          organizationId,
          projectId,
          sessionId,
          summaryHash: observation.summaryHash,
        })
      }),
    )

    expect(found?.sessionId).toBe(sessionId)
    expect(found?.summaryHash).toBe(observation.summaryHash)
  })

  it("lists embedded noise observations and counts assigned versus noise rows", async () => {
    const { noise, counts } = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* BehaviorObservationRepository
        yield* repo.upsert(makeObservation({ sessionId: SessionId("noise-session") }))
        yield* repo.upsert(
          makeObservation({
            sessionId: SessionId("short-session"),
            summaryHash: "b".repeat(64),
            embedding: [],
          }),
        )
        yield* repo.upsert(
          makeObservation({
            sessionId: SessionId("assigned-session"),
            summaryHash: "c".repeat(64),
            assignedClusterId: clusterId,
            assignmentMethod: "centroid_online",
            assignmentConfidence: 0.91,
          }),
        )

        const noise = yield* repo.listNoise({ organizationId, projectId, since: new Date("2026-05-23T00:00:00.000Z") })
        const counts = yield* repo.getCounts({ organizationId, projectId, since: new Date("2026-05-23T00:00:00.000Z") })
        return { noise, counts }
      }),
    )

    expect(noise.map((row) => row.sessionId)).toEqual([SessionId("noise-session")])
    expect(counts).toEqual({ total: 3, assigned: 1, noise: 2 })
  })

  it("rewrites observations for gardening reassignments and lists by cluster", async () => {
    const observation = makeObservation({ sessionId: SessionId("reassigned-session") })
    const rows = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* BehaviorObservationRepository
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
        return yield* repo.listByCluster({ organizationId, projectId, clusterId, limit: 10 })
      }),
    )

    expect(rows.map((row) => row.sessionId)).toEqual([observation.sessionId])
    expect(rows[0]?.assignmentMethod).toBe("gardening_reassign")
    expect(rows[0]?.reassignmentRunId).toBe(runId)
  })
})
