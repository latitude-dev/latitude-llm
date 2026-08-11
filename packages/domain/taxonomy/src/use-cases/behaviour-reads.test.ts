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
import { type ProjectBehaviourNode, promoteScaffolding, truncateNodes } from "./list-project-behaviours.ts"

const ORG_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const CUSTOM_BEHAVIOR_ID = CustomBehaviorId("b".repeat(24))

// The fake cluster repo's listSubtreeIds keys off id / project / state / path
// only, so a minimal cast is enough — these use-cases never touch the rest.
const cluster = (id: string, path: string, customBehaviorId: CustomBehaviorId | null = null): TaxonomyCluster =>
  ({
    id: TaxonomyClusterId(id),
    projectId: PROJECT_ID,
    state: "active",
    path,
    customBehaviorId,
    facetId: null,
  }) as unknown as TaxonomyCluster

const behaviourNode = (
  id: string,
  directObservationCount: number,
  children: readonly ProjectBehaviourNode[] = [],
): ProjectBehaviourNode => ({
  cluster: cluster(id, ""),
  firstSeenLabel: "older",
  trend: { status: "steady", currentCount: 0, baselineCount: 0, baselineDailyAverage: 0, ratio: null },
  novelty: "unknown",
  directObservationCount,
  subtreeObservationCount:
    directObservationCount + children.reduce((sum, child) => sum + child.subtreeObservationCount, 0),
  children,
})

const ids = (nodes: readonly ProjectBehaviourNode[]): readonly string[] => nodes.map((node) => String(node.cluster.id))

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
    const clusters = createFakeTaxonomyClusterRepository([
      cluster(ROOT, "", CUSTOM_BEHAVIOR_ID),
      cluster(CHILD, `${ROOT}/`, CUSTOM_BEHAVIOR_ID),
    ])
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

describe("promoteScaffolding", () => {
  // The pilot project's real tree: 10 groups buried under 6 interiors that
  // carry 2 sessions between them, 4 levels deep.
  const pilotTree = (rootOwn: number) =>
    behaviourNode("R", rootOwn, [
      behaviourNode("l494", 494),
      behaviourNode("i1", 1, [
        behaviourNode("l99", 99),
        behaviourNode("ia", 0, [behaviourNode("l55", 55), behaviourNode("l35", 35)]),
        behaviourNode("ib", 0, [behaviourNode("l23", 23), behaviourNode("l22", 22)]),
        behaviourNode("ic", 0, [behaviourNode("l11", 11), behaviourNode("l10", 10)]),
      ]),
      behaviourNode("id", 0, [behaviourNode("l73", 73), behaviourNode("l14", 14)]),
    ])

  const PILOT_GROUPS = ["l494", "l99", "l55", "l35", "l23", "l22", "l11", "l10", "l73", "l14"]

  const leafIds = (nodes: readonly ProjectBehaviourNode[]): readonly string[] =>
    nodes.flatMap((node) => (node.children.length === 0 ? [String(node.cluster.id)] : leafIds(node.children)))

  it("leaves an already-flat tree alone and never reorders it", () => {
    const flat = promoteScaffolding([
      behaviourNode("R", 0, [behaviourNode("A", 30), behaviourNode("B", 20), behaviourNode("C", 10)]),
    ])
    expect(ids(flat.nodes)).toEqual(["A", "B", "C"])

    // Ordering is the caller's job (`sortNodes` runs after promotion), so the
    // rule must hand rows back in the order it received them.
    const unsorted = promoteScaffolding([behaviourNode("R", 0, [behaviourNode("B", 20), behaviourNode("A", 30)])])
    expect(ids(unsorted.nodes)).toEqual(["B", "A"])
  })

  it("collapses the pilot tree's 6 signposts into its 10 real groups", () => {
    const promoted = promoteScaffolding([pilotTree(1)])

    expect(ids(promoted.nodes)).toEqual(PILOT_GROUPS)
    expect(promoted.nodes.every((node) => node.children.length === 0)).toBe(true)
  })

  it("keeps a childless root, which is the project's only group", () => {
    const promoted = promoteScaffolding([behaviourNode("R", 1946)])

    expect(ids(promoted.nodes)).toEqual(["R"])
    expect(promoted.nodes[0]?.subtreeObservationCount).toBe(1946)
    expect(promoted.residueObservationCount).toBe(0)
  })

  it("keeps a content-holding interior as a parent while promoting a signpost sibling", () => {
    const promoted = promoteScaffolding([
      behaviourNode("R", 0, [
        behaviourNode("A", 40, [behaviourNode("A1", 30), behaviourNode("A2", 20)]),
        behaviourNode("B", 0, [behaviourNode("B1", 10), behaviourNode("B2", 10)]),
      ]),
    ])

    expect(ids(promoted.nodes)).toEqual(["A", "B1", "B2"])
    expect(ids(promoted.nodes[0]?.children ?? [])).toEqual(["A1", "A2"])
  })

  it("counts a surviving interior as its own members plus its visible descendants", () => {
    const promoted = promoteScaffolding([
      behaviourNode("R", 0, [
        behaviourNode("A", 40, [behaviourNode("A1", 30), behaviourNode("A2", 20)]),
        behaviourNode("B", 0, [behaviourNode("B1", 10), behaviourNode("B2", 10)]),
      ]),
    ])

    expect(promoted.nodes[0]?.subtreeObservationCount).toBe(90)
  })

  it("collapses a whole signpost chain in one pass, not one level per call", () => {
    const promoted = promoteScaffolding([
      behaviourNode("R", 0, [
        behaviourNode("I1", 0, [behaviourNode("I2", 0, [behaviourNode("L1", 30), behaviourNode("L2", 20)])]),
      ]),
    ])

    expect(ids(promoted.nodes)).toEqual(["L1", "L2"])
  })

  it("keeps the residue of every removed node so rows plus residue equal the project", () => {
    const root = pilotTree(9)
    const promoted = promoteScaffolding([root])

    // The root's 9 plus the one session held by the promoted `i1`.
    expect(promoted.residueObservationCount).toBe(10)
    const rows = promoted.nodes.reduce((sum, node) => sum + node.subtreeObservationCount, 0)
    expect(rows + promoted.residueObservationCount).toBe(root.subtreeObservationCount)
  })

  it("spends the node budget on real groups because promotion runs before truncation", () => {
    expect(ids(truncateNodes(promoteScaffolding([pilotTree(1)]).nodes, 10))).toEqual(PILOT_GROUPS)

    // Truncating the raw tree instead spends most of the budget on scaffolding.
    const withoutPromotion = truncateNodes([pilotTree(1)], 10)
    expect(ids(withoutPromotion)).toEqual(["R"])
    expect(leafIds(withoutPromotion).length).toBeLessThan(PILOT_GROUPS.length)
  })

  it("collapses a degenerate chain to a single row", () => {
    // Deliberate: one row is below `isOpenableBehaviourTree`'s 2-node floor, so
    // such a project loses its entry point into the tree screen.
    const promoted = promoteScaffolding([behaviourNode("R", 0, [behaviourNode("I", 0, [behaviourNode("L", 50)])])])

    expect(ids(promoted.nodes)).toEqual(["L"])
  })
})
