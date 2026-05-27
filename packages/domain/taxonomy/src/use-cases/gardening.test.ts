import { AI, type AIShape, type GenerateInput, type GenerateResult } from "@domain/ai"
import { QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import {
  ChSqlClient,
  DistributedLockRepository,
  OrganizationId,
  ProjectId,
  SessionId,
  SqlClient,
  TaxonomyRunId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeDistributedLockRepository, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { TAXONOMY_EMBEDDING_DIMENSIONS, TAXONOMY_MAX_ACTIVE_CLUSTERS } from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { TaxonomyDimension } from "../entities/dimension.ts"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import { createTaxonomyCentroid, updateTaxonomyCentroid } from "../helpers.ts"
import { CalibrationProfileRepository } from "../ports/calibration-profile-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyLineageRepository } from "../ports/taxonomy-lineage-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"
import { createFakeCalibrationProfileRepository } from "../testing/fake-calibration-profile-repository.ts"
import { createFakeTaxonomyClusterRepository } from "../testing/fake-taxonomy-cluster-repository.ts"
import { createFakeTaxonomyLineageRepository } from "../testing/fake-taxonomy-lineage-repository.ts"
import { createFakeTaxonomyObservationRepository } from "../testing/fake-taxonomy-observation-repository.ts"
import { deprecateInactiveClustersUseCase } from "./deprecate-inactive-clusters.ts"
import { emitLineageUseCase } from "./emit-lineage.ts"
import { mergeNearDuplicateClustersUseCase } from "./merge-near-duplicate-clusters.ts"
import { nameClusterUseCase } from "./name-taxonomy.ts"
import { reassignNoiseToCurrentClustersUseCase } from "./reassign-noise-to-current-clusters.ts"
import { recurseTreeClustersUseCase } from "./recurse-tree-clusters.ts"
import { computeBirthMinMembers, sweepNoiseAndBirthClustersUseCase } from "./sweep-noise-and-birth-clusters.ts"
import { taxonomyGardenProjectDedupeKey, triggerProjectGardeningUseCase } from "./trigger-project-gardening.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const runId = TaxonomyRunId("r".repeat(24))
const now = new Date("2026-05-24T12:00:00.000Z")

const vector = (values: Record<number, number>) => {
  const result = new Array(TAXONOMY_EMBEDDING_DIMENSIONS).fill(0)
  for (const [index, value] of Object.entries(values)) result[Number(index)] = value
  return result
}

const makeObservation = (index: number, embedding = vector({ 0: 1 })): TaxonomyMomentObservation => ({
  organizationId,
  projectId,
  observationId: String(index).padStart(24, "o").slice(0, 24),
  sessionId: SessionId(`session-${index}`),
  analysisHash: String(index).repeat(64).slice(0, 64),
  momentId: `moment-${index}`,
  dimension: TaxonomyDimension.Topic,
  projectionMethod: "moment_text_embedding",
  projectionHash: String(index).repeat(64).slice(0, 64),
  projectionMetadata: { summary: `Observation ${index}` },
  embedding,
  startTime: new Date(now.getTime() + index * 1000),
  endTime: new Date(now.getTime() + index * 1000 + 500),
  assignedClusterId: null,
  assignmentConfidence: 0,
  assignmentMethod: "noise",
  reassignmentRunId: null,
  retentionDays: 90,
  // Analysis writes always precede gardening writes; an equal version would
  // be a ReplacingMergeTree tie the fake (correctly) refuses to overwrite.
  indexedAt: new Date(now.getTime() - 60_000),
})

const centroidFrom = (embedding: readonly number[]) => {
  const centroid = createTaxonomyCentroid()
  const updated = updateTaxonomyCentroid({
    centroid: { ...centroid, clusteredAt: now },
    embedding,
    weight: 1,
    timestamp: now,
    operation: "add",
    previousClusteredAt: now,
  })
  const { clusteredAt: _clusteredAt, ...withoutAnchor } = updated
  return withoutAnchor
}

const makeCluster = (overrides: Partial<TaxonomyCluster> = {}): TaxonomyCluster => ({
  id: "c".repeat(24) as TaxonomyCluster["id"],
  organizationId,
  projectId,
  dimension: "topic",
  parentClusterId: null,
  depth: 0,
  path: "",
  splitLinkThreshold: null,
  name: "Existing cancellation",
  description: "Users cancel subscriptions.",
  centroid: centroidFrom(vector({ 0: 1 })),
  observationCount: 10,
  state: "active",
  mergedIntoClusterId: null,
  firstObservedAt: now,
  lastObservedAt: now,
  clusteredAt: now,
  createdAt: now,
  updatedAt: now,
  ...overrides,
})

const runUseCase = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    | TaxonomyObservationRepository
    | TaxonomyClusterRepository
    | DistributedLockRepository
    | SqlClient
    | ChSqlClient
    | AI
    | CalibrationProfileRepository
  >,
  observations: ReturnType<typeof createFakeTaxonomyObservationRepository>,
  clusters: ReturnType<typeof createFakeTaxonomyClusterRepository>,
  ai?: AIShape,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
      Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
      Effect.provide(Layer.succeed(DistributedLockRepository, createFakeDistributedLockRepository().repository)),
      Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      Effect.provide(Layer.succeed(AI, ai ?? createDeterministicAi())),
      Effect.provide(Layer.succeed(CalibrationProfileRepository, createFakeCalibrationProfileRepository().repository)),
    ),
  )

const createDeterministicAi = (): AIShape => ({
  generate: <T>(input: GenerateInput<T>) =>
    Effect.sync((): GenerateResult<T> => {
      const raw = input.system.includes("mergeJudge")
        ? { sameBehavior: true }
        : input.system.includes("proposeCandidateThemes")
          ? { candidates: [{ theme: "deterministic theme", examples: [0] }] }
          : input.system.includes("behaviour profile")
            ? {
                userGoal: "A deterministic user goal",
                userGoalVariants: [],
                agentPattern: "A deterministic agent pattern",
                commonFriction: "A deterministic friction summary",
                outcomeSummary: "A deterministic outcome summary",
                representativeQuotes: [],
                answerPatternStatus: "unknown",
                answerConsistencyScore: null,
                confidence: 0.5,
              }
            : {
                name: input.system.includes("category") ? "Named category" : "Named cluster",
                description: "A deterministic long enough generated description.",
              }
      return { object: input.schema.parse(raw), tokens: 1, duration: 1 }
    }),
  embed: () => Effect.succeed({ embedding: [] }),
  rerank: () => Effect.succeed([]),
})

describe("gardening use-cases", () => {
  it("computes the proportional birth member floor", () => {
    expect(computeBirthMinMembers(250)).toBe(4)
    expect(computeBirthMinMembers(10_000)).toBe(30)
  })

  it("births a cluster from dense noise and reassigns members", async () => {
    const observations = createFakeTaxonomyObservationRepository([0, 1, 2, 3].map((index) => makeObservation(index)))
    const clusters = createFakeTaxonomyClusterRepository([])

    const result = await runUseCase(
      sweepNoiseAndBirthClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )

    expect(result.clustersBorn).toBe(1)
    expect(result.lineage).toHaveLength(1)
    expect([...clusters.clusters.values()]).toHaveLength(1)
    expect([...observations.rows.values()].every((row) => row.assignmentMethod === "gardening_birth")).toBe(true)
  })

  it("merges near-duplicate clusters and reassigns loser observations", async () => {
    const survivor = makeCluster({ id: "c".repeat(24) as TaxonomyCluster["id"], observationCount: 2_000 })
    const loser = makeCluster({ id: "d".repeat(24) as TaxonomyCluster["id"], observationCount: 1_001 })
    const loserObservations = Array.from({ length: 1_001 }, (_, index) => ({
      ...makeObservation(index),
      startTime: now,
      assignedClusterId: loser.id,
      assignmentMethod: "centroid_online" as const,
    }))
    const observations = createFakeTaxonomyObservationRepository(loserObservations)
    const clusters = createFakeTaxonomyClusterRepository([survivor, loser])

    const result = await runUseCase(
      mergeNearDuplicateClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )

    expect(result.clustersMerged).toBe(1)
    expect(result.observationsReassigned).toBe(1_001)
    expect(result.lineage.map((row) => row.transitionType)).toEqual(["merge"])
    expect(clusters.clusters.get(loser.id)?.state).toBe("merged")
    expect([...observations.rows.values()][0]?.assignedClusterId).toBe(survivor.id)
    expect([...observations.rows.values()].filter((row) => row.assignedClusterId === survivor.id)).toHaveLength(1_001)
    expect(clusters.clusters.get(survivor.id)?.observationCount).toBe(3_001)
  })

  it("accumulates a multi-loser component onto the survivor with fresh reads per loser", async () => {
    const survivor = makeCluster({
      id: "c".repeat(24) as TaxonomyCluster["id"],
      name: "Order management",
      description: "Users manage their orders.",
      observationCount: 100,
    })
    const loserA = makeCluster({
      id: "d".repeat(24) as TaxonomyCluster["id"],
      name: "Order management requests",
      description: "Users request order management help.",
      centroid: centroidFrom(vector({ 0: 1, 1: 0.05 })),
      observationCount: 30,
    })
    const loserB = makeCluster({
      id: "e".repeat(24) as TaxonomyCluster["id"],
      name: "Order management support",
      description: "Users ask for order management support.",
      centroid: centroidFrom(vector({ 0: 1, 1: -0.05 })),
      observationCount: 20,
    })
    const observations = createFakeTaxonomyObservationRepository([])
    const clusters = createFakeTaxonomyClusterRepository([survivor, loserA, loserB])

    const result = await runUseCase(
      mergeNearDuplicateClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )

    expect(result.clustersMerged).toBe(2)
    expect(clusters.clusters.get(loserA.id)?.state).toBe("merged")
    expect(clusters.clusters.get(loserB.id)?.state).toBe("merged")
    // Each loser's survivor update reads fresh state: 100 + 30 + 20.
    expect(clusters.clusters.get(survivor.id)?.observationCount).toBe(150)
    const merge = result.lineage.find((row) => row.transitionType === "merge")
    expect(merge?.fromClusterIds.slice().sort()).toEqual([loserA.id, loserB.id].sort())
    expect(merge?.toClusterIds).toEqual([survivor.id])
  })

  it("merges root fragments at root density and re-parents the loser's subtree", async () => {
    // 0.80 cosine: above the coarse root link (0.70) that defines the level,
    // below the tight child-level floor (0.86) that used to gate nomination.
    const survivor = makeCluster({
      id: "c".repeat(24) as TaxonomyCluster["id"],
      name: "Flight booking modification",
      description: "Users change existing flight bookings.",
      observationCount: 80,
    })
    const loser = makeCluster({
      id: "d".repeat(24) as TaxonomyCluster["id"],
      // No name-token overlap with the survivor: nomination must come from
      // the root density floor alone.
      name: "Reservation management",
      description: "Users manage existing reservations.",
      centroid: centroidFrom(vector({ 0: 0.8, 1: 0.6 })),
      observationCount: 7,
    })
    const child = makeCluster({
      id: "e".repeat(24) as TaxonomyCluster["id"],
      name: "Seat changes",
      description: "Users change seats.",
      parentClusterId: loser.id,
      depth: 1,
      path: `${loser.id}/`,
      observationCount: 4,
    })
    const grandchild = makeCluster({
      id: "f".repeat(24) as TaxonomyCluster["id"],
      name: "Exit row seat changes",
      description: "Users request exit row seats.",
      parentClusterId: child.id,
      depth: 2,
      path: `${loser.id}/${child.id}/`,
      observationCount: 2,
    })
    const observations = createFakeTaxonomyObservationRepository([])
    const clusters = createFakeTaxonomyClusterRepository([survivor, loser, child, grandchild])

    const result = await runUseCase(
      mergeNearDuplicateClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )

    expect(result.clustersMerged).toBe(1)
    expect(clusters.clusters.get(loser.id)?.state).toBe("merged")
    expect(clusters.clusters.get(child.id)?.parentClusterId).toBe(survivor.id)
    expect(clusters.clusters.get(child.id)?.path).toBe(`${survivor.id}/`)
    expect(clusters.clusters.get(grandchild.id)?.parentClusterId).toBe(child.id)
    expect(clusters.clusters.get(grandchild.id)?.path).toBe(`${survivor.id}/${child.id}/`)
  })

  it("merges the tight end of an approved chain instead of dropping the whole component", async () => {
    // a~b are near-identical; c chains to b via an approved pair but sits far
    // from a. A naive transitive component {a, b, c} fails the floor and used
    // to block every merge in it; complete linkage keeps the a~b merge.
    const a = makeCluster({
      id: "c".repeat(24) as TaxonomyCluster["id"],
      name: "Retail order management",
      description: "Users modify, cancel, or exchange orders.",
      observationCount: 200,
    })
    const b = makeCluster({
      id: "d".repeat(24) as TaxonomyCluster["id"],
      name: "Order management and modifications",
      description: "Users modify or cancel retail orders.",
      centroid: centroidFrom(vector({ 0: 1, 1: 0.1 })),
      observationCount: 90,
    })
    const c = makeCluster({
      id: "e".repeat(24) as TaxonomyCluster["id"],
      name: "Order address updates",
      description: "Users update shipping addresses on orders.",
      // b~c ≈ 0.76 (nominated, approved); a~c ≈ 0.69 (below the root floor).
      centroid: centroidFrom(vector({ 0: 0.69, 1: 0.724 })),
      observationCount: 30,
    })
    const observations = createFakeTaxonomyObservationRepository([])
    const clusters = createFakeTaxonomyClusterRepository([a, b, c])

    const result = await runUseCase(
      mergeNearDuplicateClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )

    expect(result.clustersMerged).toBe(1)
    expect(clusters.clusters.get(b.id)?.state).toBe("merged")
    expect(clusters.clusters.get(b.id)?.mergedIntoClusterId).toBe(a.id)
    expect(clusters.clusters.get(c.id)?.state).toBe("active")
  })

  it("does not nominate child siblings below the tight merge floor", async () => {
    const parentId = "a".repeat(24) as TaxonomyCluster["id"]
    const left = makeCluster({
      id: "c".repeat(24) as TaxonomyCluster["id"],
      name: "Data speed issues",
      description: "Users report slow data.",
      parentClusterId: parentId,
      depth: 1,
      path: `${parentId}/`,
    })
    const right = makeCluster({
      id: "d".repeat(24) as TaxonomyCluster["id"],
      name: "Connectivity issues",
      description: "Users report no connectivity.",
      centroid: centroidFrom(vector({ 0: 0.8, 1: 0.6 })),
      parentClusterId: parentId,
      depth: 1,
      path: `${parentId}/`,
      observationCount: 20,
    })
    const observations = createFakeTaxonomyObservationRepository([])
    const clusters = createFakeTaxonomyClusterRepository([left, right])

    const result = await runUseCase(
      mergeNearDuplicateClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )

    expect(result.clustersMerged).toBe(0)
  })

  it("does not merge similar clusters when the merge judge rejects the pair", async () => {
    const lookup = makeCluster({
      id: "c".repeat(24) as TaxonomyCluster["id"],
      name: "Order lookup without ID",
      description: "Users locate orders using name and ZIP code.",
    })
    const approval = makeCluster({
      id: "d".repeat(24) as TaxonomyCluster["id"],
      name: "Approval to proceed",
      description: "Users approve a proposed action before execution.",
      observationCount: 20,
    })
    const observations = createFakeTaxonomyObservationRepository([])
    const clusters = createFakeTaxonomyClusterRepository([lookup, approval])
    const rejectingAi: AIShape = {
      ...createDeterministicAi(),
      generate: <T>(input: GenerateInput<T>) =>
        Effect.sync(
          (): GenerateResult<T> => ({ object: input.schema.parse({ sameBehavior: false }), tokens: 1, duration: 1 }),
        ),
    }

    const result = await runUseCase(
      mergeNearDuplicateClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
      rejectingAi,
    )

    expect(result.clustersMerged).toBe(0)
    expect(clusters.clusters.get(lookup.id)?.state).toBe("active")
    expect(clusters.clusters.get(approval.id)?.state).toBe("active")
  })

  it("deprecates inactive clusters whose decayed mass is below the floor", async () => {
    const staleLowMass = makeCluster({
      id: "e".repeat(24) as TaxonomyCluster["id"],
      centroid: { ...centroidFrom(vector({ 0: 1 })), mass: 0.4 },
      lastObservedAt: new Date("2026-04-01T00:00:00.000Z"),
      clusteredAt: new Date("2026-04-01T00:00:00.000Z"),
    })
    const staleHighMass = makeCluster({
      id: "f".repeat(24) as TaxonomyCluster["id"],
      centroid: { ...centroidFrom(vector({ 0: 1 })), mass: 10 },
      lastObservedAt: new Date("2026-04-01T00:00:00.000Z"),
      clusteredAt: new Date("2026-05-23T00:00:00.000Z"),
    })
    const recentlyObserved = makeCluster({ id: "g".repeat(24) as TaxonomyCluster["id"], lastObservedAt: now })
    const observations = createFakeTaxonomyObservationRepository([])
    const clusters = createFakeTaxonomyClusterRepository([staleLowMass, staleHighMass, recentlyObserved])

    const result = await runUseCase(
      deprecateInactiveClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )

    expect(result.clustersDeprecated).toBe(1)
    expect(result.lineage.map((row) => row.transitionType)).toEqual(["death"])
    expect(clusters.clusters.get(staleLowMass.id)?.state).toBe("deprecated")
    expect(clusters.clusters.get(staleHighMass.id)?.state).toBe("active")
    expect(clusters.clusters.get(recentlyObserved.id)?.state).toBe("active")
  })

  it("reassigns recent noise to current clusters using the two-gate assignment", async () => {
    const matching = makeObservation(20, vector({ 0: 1 }))
    const unrelated = makeObservation(21, vector({ 1: 1 }))
    const observations = createFakeTaxonomyObservationRepository([matching, unrelated])
    const clusters = createFakeTaxonomyClusterRepository([makeCluster()])

    const result = await runUseCase(
      reassignNoiseToCurrentClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )

    expect(result).toEqual({ noiseScanned: 2, observationsReassigned: 1 })
    expect(
      observations.rows.get(`${organizationId}|${projectId}|${matching.dimension}|${matching.observationId}`)
        ?.assignmentMethod,
    ).toBe("gardening_reassign")
    expect(
      observations.rows.get(`${organizationId}|${projectId}|${unrelated.dimension}|${unrelated.observationId}`)
        ?.assignmentMethod,
    ).toBe("noise")
    expect(clusters.clusters.get("c".repeat(24) as TaxonomyCluster["id"])?.observationCount).toBe(11)
  })

  it("names clusters with deterministic AI map-reduce calls", async () => {
    const cluster = makeCluster({
      id: "j".repeat(24) as TaxonomyCluster["id"],
      name: "Pending",
    })
    const observations = createFakeTaxonomyObservationRepository(
      [0, 1, 2, 3].map((index) => ({
        ...makeObservation(index, vector({ [index]: 1 })),
        assignedClusterId: cluster.id,
        summary: `sample ${index}`,
      })),
    )
    const clusters = createFakeTaxonomyClusterRepository([cluster])
    let calls = 0
    const ai: AIShape = {
      generate: <T>(input: GenerateInput<T>) =>
        Effect.sync((): GenerateResult<T> => {
          calls++
          const raw = input.system.includes("proposeCandidateThemes")
            ? { candidates: [{ theme: "deterministic theme", examples: [0] }] }
            : {
                name: "Named cluster",
                description: "A deterministic long enough generated description.",
              }
          return { object: input.schema.parse(raw), tokens: 1, duration: 1 }
        }),
      embed: () => Effect.succeed({ embedding: [] }),
      rerank: () => Effect.succeed([]),
    }

    await Effect.runPromise(
      nameClusterUseCase({ organizationId, projectId, clusterId: cluster.id, now }).pipe(
        Effect.provide(Layer.succeed(AI, ai)),
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      ),
    )

    expect(calls).toBe(2)
    expect(clusters.clusters.get(cluster.id)?.name).toBe("Named cluster")
  })

  it("manual trigger publishes gardenProject with org-scoped throttle key", async () => {
    const queue = createFakeQueuePublisher()

    const result = await Effect.runPromise(
      triggerProjectGardeningUseCase({ organizationId, projectId, reason: "manual" }).pipe(
        Effect.provide(Layer.succeed(QueuePublisher, queue.publisher)),
      ),
    )

    expect(result).toEqual({ queued: true })
    expect(queue.published).toHaveLength(1)
    expect(queue.published[0]).toMatchObject({
      queue: "taxonomy",
      task: "gardenProject",
      payload: { organizationId, projectId, reason: "manual" },
      options: { dedupeKey: taxonomyGardenProjectDedupeKey({ organizationId, projectId }) },
    })
  })

  it("emits lineage rows returned by gardening activities", async () => {
    const observations = createFakeTaxonomyObservationRepository([0, 1, 2, 3].map((index) => makeObservation(index)))
    const clusters = createFakeTaxonomyClusterRepository([])
    const lineage = createFakeTaxonomyLineageRepository()

    const sweepResult = await runUseCase(
      sweepNoiseAndBirthClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )
    const emitResult = await Effect.runPromise(
      emitLineageUseCase({ transitions: sweepResult.lineage }).pipe(
        Effect.provide(Layer.succeed(TaxonomyLineageRepository, lineage.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(emitResult).toEqual({ emitted: 1 })
    expect(lineage.rows.map((row) => row.transitionType)).toEqual(["birth"])
  })

  it("absorbs dense noise into an existing active cluster instead of birthing", async () => {
    const observations = createFakeTaxonomyObservationRepository([0, 1, 2, 3].map((index) => makeObservation(index)))
    const clusters = createFakeTaxonomyClusterRepository([makeCluster()])

    const result = await runUseCase(
      sweepNoiseAndBirthClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )

    expect(result.clustersBorn).toBe(0)
    expect(result.observationsAbsorbed).toBe(4)
    expect(result.lineage).toHaveLength(0)
    expect([...clusters.clusters.values()]).toHaveLength(1)
  })

  it("stops birthing new clusters once the active-cluster cap is reached", async () => {
    const observations = createFakeTaxonomyObservationRepository([0, 1, 2, 3].map((index) => makeObservation(index)))
    // Orthogonal centroids so the dense noise can neither be absorbed nor
    // birth a new cluster while the dimension sits at the cap.
    const atCap = Array.from({ length: TAXONOMY_MAX_ACTIVE_CLUSTERS }, (_, index) =>
      makeCluster({
        id: String(index).padStart(24, "k").slice(0, 24) as TaxonomyCluster["id"],
        centroid: centroidFrom(vector({ 1: 1 })),
      }),
    )
    const clusters = createFakeTaxonomyClusterRepository(atCap)

    const result = await runUseCase(
      sweepNoiseAndBirthClustersUseCase({ organizationId, projectId, runId, now }),
      observations,
      clusters,
    )

    expect(result.clustersBorn).toBe(0)
    expect(result.lineage).toHaveLength(0)
    expect([...clusters.clusters.values()]).toHaveLength(TAXONOMY_MAX_ACTIVE_CLUSTERS)
  })
})

describe("recurseTreeClustersUseCase", () => {
  it("splits a fat node into tighter-density children and keeps residue on the parent", async () => {
    const node = makeCluster({ observationCount: 60 })
    const clusters = createFakeTaxonomyClusterRepository([node])
    const observations = createFakeTaxonomyObservationRepository(
      Array.from({ length: 60 }, (_, index) => ({
        ...makeObservation(index, vector({ [index < 30 ? 1 : 2]: 1 })),
        assignedClusterId: node.id,
        assignmentMethod: "centroid_online" as const,
        assignmentConfidence: 0.9,
      })),
    )

    const result = await runUseCase(
      recurseTreeClustersUseCase({ organizationId, projectId, runId }),
      observations,
      clusters,
    )

    expect(result.nodesRecursed).toBe(1)
    expect(result.childrenBorn).toBe(2)
    expect(result.observationsMoved).toBe(60)
    expect(result.lineage.map((row) => row.transitionType)).toEqual(["split"])

    const children = [...clusters.clusters.values()].filter((cluster) => cluster.parentClusterId === node.id)
    expect(children).toHaveLength(2)
    expect(children.map((child) => child.depth)).toEqual([1, 1])
    expect(children.map((child) => child.path)).toEqual([`${node.id}/`, `${node.id}/`])
    expect(children.reduce((sum, child) => sum + child.observationCount, 0)).toBe(60)
    expect(clusters.clusters.get(node.id)?.observationCount).toBe(0)
    expect([...observations.rows.values()].filter((row) => row.assignmentMethod === "gardening_reassign")).toHaveLength(
      60,
    )
  })

  it("re-splits regrown residue at the node's stored density instead of re-deriving it", async () => {
    // First split happened at 0.85; the node's residue regrew with two new
    // tight groups. The re-split must reuse splitLinkThreshold so the new
    // children join the same density cohort as the existing ones.
    const node = makeCluster({ observationCount: 60, splitLinkThreshold: 0.85 })
    const existingChild = makeCluster({
      id: "h".repeat(24) as TaxonomyCluster["id"],
      name: "Existing subtopic",
      description: "Born at the first split.",
      parentClusterId: node.id,
      depth: 1,
      path: `${node.id}/`,
      observationCount: 40,
    })
    const clusters = createFakeTaxonomyClusterRepository([node, existingChild])
    const observations = createFakeTaxonomyObservationRepository(
      Array.from({ length: 60 }, (_, index) => ({
        ...makeObservation(index, vector({ [index < 30 ? 1 : 2]: 1 })),
        assignedClusterId: node.id,
        assignmentMethod: "centroid_online" as const,
        assignmentConfidence: 0.9,
      })),
    )

    const result = await runUseCase(
      recurseTreeClustersUseCase({ organizationId, projectId, runId }),
      observations,
      clusters,
    )

    expect(result.nodesRecursed).toBe(1)
    expect(clusters.clusters.get(node.id)?.splitLinkThreshold).toBe(0.85)
    const children = [...clusters.clusters.values()].filter((cluster) => cluster.parentClusterId === node.id)
    expect(children.length).toBeGreaterThanOrEqual(3)
  })

  it("rolls back when the node has no internal structure", async () => {
    const node = makeCluster({ observationCount: 60 })
    const clusters = createFakeTaxonomyClusterRepository([node])
    const observations = createFakeTaxonomyObservationRepository(
      Array.from({ length: 60 }, (_, index) => ({
        ...makeObservation(index, vector({ 0: 1 })),
        assignedClusterId: node.id,
        assignmentMethod: "centroid_online" as const,
        assignmentConfidence: 0.9,
      })),
    )

    const result = await runUseCase(
      recurseTreeClustersUseCase({ organizationId, projectId, runId }),
      observations,
      clusters,
    )

    expect(result.nodesRecursed).toBe(0)
    expect(result.childrenBorn).toBe(0)
    expect([...clusters.clusters.values()]).toHaveLength(1)
    expect(clusters.clusters.get(node.id)?.observationCount).toBe(60)
  })

  it("skips small nodes below the recursion floor", async () => {
    const node = makeCluster({ observationCount: 10 })
    const clusters = createFakeTaxonomyClusterRepository([node])
    const observations = createFakeTaxonomyObservationRepository(
      Array.from({ length: 10 }, (_, index) => ({
        ...makeObservation(index, vector({ [index % 2]: 1 })),
        assignedClusterId: node.id,
        assignmentMethod: "centroid_online" as const,
        assignmentConfidence: 0.9,
      })),
    )

    const result = await runUseCase(
      recurseTreeClustersUseCase({ organizationId, projectId, runId }),
      observations,
      clusters,
    )

    expect(result.nodesRecursed).toBe(0)
    expect([...clusters.clusters.values()]).toHaveLength(1)
  })
})
