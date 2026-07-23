import { ChSqlClient, CustomBehaviorId, OrganizationId, ProjectId, SqlClient, TaxonomyClusterId } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type {
  ClusterSessionsPage,
  ClusterTrajectoryRow,
  GetClusterTrajectoryInput,
  ListClusterSessionsInput,
  TaxonomyClusterIntelligenceRepositoryShape,
} from "../ports/taxonomy-cluster-intelligence-repository.ts"
import { TaxonomyClusterIntelligenceRepository } from "../ports/taxonomy-cluster-intelligence-repository.ts"
import { TaxonomyClusterRepository, type TaxonomyClusterRepositoryShape } from "../ports/taxonomy-cluster-repository.ts"
import { createFakeTaxonomyClusterIntelligenceRepository } from "../testing/fake-taxonomy-cluster-intelligence-repository.ts"
import { createFakeTaxonomyClusterRepository } from "../testing/fake-taxonomy-cluster-repository.ts"
import { getBehaviourTrajectoryUseCase } from "./get-behaviour-trajectory.ts"
import { listBehaviourSessionsUseCase } from "./list-behaviour-sessions.ts"

const ORG_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const CUSTOM_BEHAVIOR_ID = CustomBehaviorId("b".repeat(24))

// The fake cluster repo's listSubtreeIds keys off id / project / state / path
// only, so a minimal cast is enough — these use-cases never touch the rest.
const cluster = (id: string, path: string): TaxonomyCluster =>
  ({ id: TaxonomyClusterId(id), projectId: PROJECT_ID, state: "active", path }) as unknown as TaxonomyCluster

const trajectoryRow = (bucket: string, frequency: number): ClusterTrajectoryRow => ({
  bucket,
  frequency,
  escalation: 0,
  resolution: 0,
  churnRisk: 0,
  wins: 0,
  maxLastMessageIndex: 0,
  maxEscalationLastMessageIndex: 0,
  maxResolutionLastMessageIndex: 0,
  maxChurnRiskLastMessageIndex: 0,
  maxWinsLastMessageIndex: 0,
})

const run = <A, E>(
  clusters: TaxonomyClusterRepositoryShape,
  intelligence: TaxonomyClusterIntelligenceRepositoryShape,
  effect: Effect.Effect<
    A,
    E,
    TaxonomyClusterRepository | TaxonomyClusterIntelligenceRepository | SqlClient | ChSqlClient
  >,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters)),
      Effect.provide(Layer.succeed(TaxonomyClusterIntelligenceRepository, intelligence)),
      Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
    ),
  )

describe("listBehaviourSessionsUseCase", () => {
  const ROOT = "r".repeat(24)
  const CHILD = "c".repeat(24)

  it("resolves the whole subtree and forwards it (plus filters + scope) to the intelligence repo", async () => {
    const clusters = createFakeTaxonomyClusterRepository([cluster(ROOT, ""), cluster(CHILD, `${ROOT}/`)])
    const page: ClusterSessionsPage = {
      sessions: [
        {
          sessionId: "s1",
          traceId: "t1",
          momentId: "m1",
          summary: "hi",
          startTime: new Date("2026-05-24T00:00:00.000Z"),
          endTime: new Date("2026-05-24T01:00:00.000Z"),
          momentKinds: ["escalation"],
        },
      ],
      histogram: [{ startTime: new Date("2026-05-24T00:00:00.000Z"), count: 1 }],
      hasMore: false,
      nextOffset: null,
    }
    let captured: ListClusterSessionsInput | undefined
    const intelligence = createFakeTaxonomyClusterIntelligenceRepository({
      listClusterSessions: (input) => {
        captured = input
        return Effect.succeed(page)
      },
    })

    const result = await run(
      clusters.repository,
      intelligence.repository,
      listBehaviourSessionsUseCase({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        clusterId: TaxonomyClusterId(ROOT),
        filter: "escalation",
        offset: 10,
        limit: 20,
        customBehaviorId: CUSTOM_BEHAVIOR_ID,
      }),
    )

    expect([...(captured?.clusterIds ?? [])].map(String).sort()).toEqual([ROOT, CHILD].sort())
    expect(captured?.customBehaviorId).toBe(CUSTOM_BEHAVIOR_ID)
    expect(captured?.filter).toBe("escalation")
    expect(captured?.offset).toBe(10)
    expect(captured?.limit).toBe(20)
    expect(result).toBe(page)
  })

  it("returns an empty page without querying sessions when the subtree is empty", async () => {
    const clusters = createFakeTaxonomyClusterRepository([])
    let called = false
    const intelligence = createFakeTaxonomyClusterIntelligenceRepository({
      listClusterSessions: () => {
        called = true
        return Effect.succeed({ sessions: [], histogram: [], hasMore: false, nextOffset: null })
      },
    })

    const result = await run(
      clusters.repository,
      intelligence.repository,
      listBehaviourSessionsUseCase({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        clusterId: TaxonomyClusterId(ROOT),
      }),
    )

    expect(called).toBe(false)
    expect(result).toEqual({ sessions: [], histogram: [], hasMore: false, nextOffset: null })
  })
})

describe("getBehaviourTrajectoryUseCase", () => {
  const A = "a".repeat(24)
  const B = "b".repeat(24)

  const intelligenceFor = () =>
    createFakeTaxonomyClusterIntelligenceRepository({
      getClusterTrajectory: (input: GetClusterTrajectoryInput) =>
        Effect.succeed(
          input.clusterIds.includes(TaxonomyClusterId(A)) ? [trajectoryRow("10", 1)] : [trajectoryRow("2", 3)],
        ),
    })

  it("tags each category's rows and unions buckets numerically for the turn axis", async () => {
    const clusters = createFakeTaxonomyClusterRepository([cluster(A, ""), cluster(B, "")])

    const result = await run(
      clusters.repository,
      intelligenceFor().repository,
      getBehaviourTrajectoryUseCase({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        categoryClusterIds: [TaxonomyClusterId(A), TaxonomyClusterId(B)],
        axis: "turn",
      }),
    )

    expect(result.buckets).toEqual(["2", "10"])
    expect(Object.fromEntries(result.rows.map((row) => [row.categoryClusterId, row.bucket]))).toEqual({
      [A]: "10",
      [B]: "2",
    })
  })

  it("dedupes repeated categories and returns empty for no categories", async () => {
    const clusters = createFakeTaxonomyClusterRepository([cluster(A, "")])

    const deduped = await run(
      clusters.repository,
      intelligenceFor().repository,
      getBehaviourTrajectoryUseCase({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        categoryClusterIds: [TaxonomyClusterId(A), TaxonomyClusterId(A)],
        axis: "turn",
      }),
    )
    expect(deduped.rows.filter((row) => row.categoryClusterId === A)).toHaveLength(1)

    const empty = await run(
      clusters.repository,
      intelligenceFor().repository,
      getBehaviourTrajectoryUseCase({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        categoryClusterIds: [],
        axis: "turn",
      }),
    )
    expect(empty).toEqual({ buckets: [], rows: [] })
  })

  it("sorts day-axis buckets lexically", async () => {
    const clusters = createFakeTaxonomyClusterRepository([cluster(A, ""), cluster(B, "")])
    const intelligence = createFakeTaxonomyClusterIntelligenceRepository({
      getClusterTrajectory: (input: GetClusterTrajectoryInput) =>
        Effect.succeed(
          input.clusterIds.includes(TaxonomyClusterId(A))
            ? [trajectoryRow("2026-05-10", 1)]
            : [trajectoryRow("2026-05-02", 1)],
        ),
    })

    const result = await run(
      clusters.repository,
      intelligence.repository,
      getBehaviourTrajectoryUseCase({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        categoryClusterIds: [TaxonomyClusterId(A), TaxonomyClusterId(B)],
        axis: "day",
      }),
    )

    expect(result.buckets).toEqual(["2026-05-02", "2026-05-10"])
  })
})
