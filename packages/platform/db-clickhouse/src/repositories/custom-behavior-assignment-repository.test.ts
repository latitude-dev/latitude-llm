import {
  type ChSqlClient,
  CustomBehaviorId,
  OrganizationId,
  ProjectId,
  SessionId,
  TaxonomyClusterId,
} from "@domain/shared"
import { type CustomBehaviorAssignment, CustomBehaviorAssignmentRepository } from "@domain/taxonomy"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { CustomBehaviorAssignmentRepositoryLive } from "./custom-behavior-assignment-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const customBehaviorId = CustomBehaviorId("b".repeat(24))
const otherBehaviorId = CustomBehaviorId("c".repeat(24))
const clusterA = TaxonomyClusterId("a".repeat(24))
const clusterB = TaxonomyClusterId("d".repeat(24))
const now = new Date("2026-06-01T12:00:00.000Z")

const ch = setupTestClickHouse()

const run = <A, E>(effect: Effect.Effect<A, E, CustomBehaviorAssignmentRepository | ChSqlClient>) =>
  Effect.runPromise(effect.pipe(withClickHouse(CustomBehaviorAssignmentRepositoryLive, ch.client, organizationId)))

let seq = 0
const makeAssignment = (overrides: Partial<CustomBehaviorAssignment> = {}): CustomBehaviorAssignment => {
  seq += 1
  return {
    organizationId,
    projectId,
    customBehaviorId,
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

describe("CustomBehaviorAssignmentRepositoryLive", () => {
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
        const repo = yield* CustomBehaviorAssignmentRepository
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
        const repo = yield* CustomBehaviorAssignmentRepository
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
        const repo = yield* CustomBehaviorAssignmentRepository
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
        const repo = yield* CustomBehaviorAssignmentRepository
        yield* repo.upsertMany([
          makeAssignment({ observationId: "mine".padEnd(24, "0"), customBehaviorId }),
          makeAssignment({ observationId: "theirs".padEnd(24, "0"), customBehaviorId: otherBehaviorId }),
        ])
        return yield* repo.listByBehavior({ organizationId, projectId, customBehaviorId, limit: 100 })
      }),
    )
    expect(listed.map((a) => a.observationId)).toEqual(["mine".padEnd(24, "0")])
  })

  it("purges a behavior's slice on deleteByBehavior", async () => {
    const listed = await run(
      Effect.gen(function* () {
        const repo = yield* CustomBehaviorAssignmentRepository
        yield* repo.upsertMany([makeAssignment(), makeAssignment()])
        yield* repo.deleteByBehavior({ organizationId, projectId, customBehaviorId })
        return yield* repo.listByBehavior({ organizationId, projectId, customBehaviorId, limit: 100 })
      }),
    )
    expect(listed).toHaveLength(0)
  })
})
