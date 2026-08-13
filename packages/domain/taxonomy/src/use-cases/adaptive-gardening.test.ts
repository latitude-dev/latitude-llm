import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import {
  ChSqlClient,
  CustomBehaviorId,
  OrganizationId,
  ProjectId,
  SessionId,
  SqlClient,
  type TaxonomyClusterId,
  TaxonomyRunId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Duration, Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { isAdaptiveModeActive } from "../adaptive-mode.ts"
import type { ClusteringTreeNode } from "../clustering.ts"
import {
  TAXONOMY_ADAPTIVE_STRUCTURAL_MAX_NODES,
  TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
  TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE,
} from "../constants.ts"
import { type TaxonomyCluster, taxonomyClusterSchema } from "../entities/cluster.ts"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"
import { createFakeTaxonomyClusterRepository } from "../testing/fake-taxonomy-cluster-repository.ts"
import { createFakeTaxonomyObservationRepository } from "../testing/fake-taxonomy-observation-repository.ts"
import {
  type HierarchicalTaxonomyPlan,
  planHierarchicalTaxonomyUseCase,
  runTaxonomyClusterBuild,
  type TaxonomyClusterBuilder,
} from "./build-hierarchical-taxonomy.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const runId = TaxonomyRunId("r".repeat(24))

// Two well-separated groups with small within-group jitter (a zero-spread
// cluster scores CH=0 and never splits). Embeddings are normalized inside the
// use case, so raw magnitudes are fine here.
const groupVector = (group: 0 | 1, jitterIndex: number): number[] => {
  const values = new Array<number>(EMBEDDING_DIMENSIONS).fill(0)
  values[group] = 1
  values[100 + group] = 0.03 * (jitterIndex % 5)
  return values
}

const makeObservation = (index: number, group: 0 | 1, at: Date): TaxonomyMomentObservation => ({
  organizationId,
  projectId,
  observationId: String(index).padStart(24, "o").slice(0, 24),
  sessionId: SessionId(`session-${index}`),
  analysisHash: String(index).repeat(64).slice(0, 64),
  momentId: `moment-${index}`,
  projectionMethod: "moment_text_embedding",
  projectionHash: String(index).repeat(64).slice(0, 64),
  projectionMetadata: { summary: `Observation ${index}` },
  embedding: groupVector(group, index),
  startTime: new Date(at.getTime() + index * 1000),
  endTime: new Date(at.getTime() + index * 1000 + 500),
  assignedClusterId: null,
  assignmentConfidence: 0,
  assignmentMethod: "noise",
  reassignmentRunId: null,
  retentionDays: 90,
  indexedAt: new Date(at.getTime() - 60_000),
})

// 40 observations across two separable groups → root splits into two leaves.
const twoGroupCorpus = (at: Date): TaxonomyMomentObservation[] =>
  Array.from({ length: 40 }, (_, index) => makeObservation(index, index < 20 ? 0 : 1, at))

const runPlan = (
  observations: ReturnType<typeof createFakeTaxonomyObservationRepository>,
  clusters: ReturnType<typeof createFakeTaxonomyClusterRepository>,
  args: {
    readonly now: Date
    readonly mode?: "off" | "enforced"
    readonly customBehaviorId?: CustomBehaviorId
    readonly clusterBuilder?: TaxonomyClusterBuilder
  },
): Promise<HierarchicalTaxonomyPlan> =>
  Effect.runPromise(
    planHierarchicalTaxonomyUseCase({
      organizationId,
      projectId,
      runId,
      dimension: "topic",
      now: args.now,
      ...(args.mode ? { mode: args.mode } : {}),
      ...(args.clusterBuilder ? { clusterBuilder: args.clusterBuilder } : {}),
      ...(args.customBehaviorId
        ? { customBehaviorId: args.customBehaviorId, filterSet: { userId: [{ op: "in", value: ["u"] }] } }
        : {}),
    }).pipe(
      Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
      Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
      Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
    ),
  )

const now = new Date("2026-05-24T12:00:00.000Z")

describe("planHierarchicalTaxonomyUseCase adaptive (enforced) publish plan", () => {
  it("builds a staging tree with leaf routing targets, decision metadata, and no sample assignments", async () => {
    const observations = createFakeTaxonomyObservationRepository(twoGroupCorpus(now))
    const clusters = createFakeTaxonomyClusterRepository([])

    const plan = await runPlan(observations, clusters, { now, mode: "enforced" })

    expect(plan.mode).toBe("enforced")
    expect(plan.clusters.length).toBeGreaterThanOrEqual(3)
    // Every built cluster is staging — hidden from active reads until the swap.
    expect(plan.clusters.every((cluster) => cluster.state === "staging")).toBe(true)
    // Full-window reassignment routes into these; sample assignments are unused.
    expect(plan.leafClusters.length).toBeGreaterThanOrEqual(2)
    expect(plan.observationAssignments).toEqual([])
    expect(plan.customAssignments).toEqual([])
    expect(plan.decisionMetadata).not.toBeNull()
    expect(plan.decisionMetadata?.acceptedSplits).toBeGreaterThanOrEqual(1)
  })

  it("stores the member-confidence splitLinkThreshold the online router reads at descent time", async () => {
    const observations = createFakeTaxonomyObservationRepository(twoGroupCorpus(now))
    const clusters = createFakeTaxonomyClusterRepository([])

    const plan = await runPlan(observations, clusters, { now, mode: "enforced" })

    const interior = plan.clusters.filter((cluster) => cluster.splitLinkThreshold !== null)
    expect(interior.length).toBeGreaterThanOrEqual(1)
    for (const cluster of interior) {
      const threshold = cluster.splitLinkThreshold as number
      // Floored by the global absolute threshold and a valid stored [0,1] value.
      expect(threshold).toBeGreaterThanOrEqual(TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD)
      expect(threshold).toBeLessThanOrEqual(1)
      // The persisted threshold is exactly a value the builder derived.
      expect(plan.decisionMetadata?.routingThresholds).toContain(threshold)
    }
  })

  it("supersedes the whole old tree and gives staging fresh ids (continuity via lineage, not id reuse)", async () => {
    const observations = createFakeTaxonomyObservationRepository(twoGroupCorpus(now))
    const clusters = createFakeTaxonomyClusterRepository([])

    // First adaptive pass, then simulate the swap so pass two sees them active.
    const first = await runPlan(observations, clusters, { now, mode: "enforced" })
    for (const cluster of first.clusters) clusters.clusters.set(cluster.id, { ...cluster, state: "active" })
    const firstIds = new Set(first.clusters.map((cluster) => cluster.id))

    const second = await runPlan(observations, clusters, {
      now: new Date(now.getTime() + 6 * 60 * 60_000),
      mode: "enforced",
    })

    // Fresh ids: no staging cluster reuses a prior active id.
    expect(second.clusters.every((cluster) => !firstIds.has(cluster.id))).toBe(true)
    // The whole old active tree is superseded for the atomic swap.
    expect([...second.supersededClusterIds].sort()).toEqual([...firstIds].sort())
    // Continuity is still recorded in lineage.
    expect(second.lineage.some((row) => row.transitionType === "continuation")).toBe(true)
  })
})

describe("planHierarchicalTaxonomyUseCase off is a byte-identical no-op", () => {
  it("global: staged clusters, sample assignments, no full-window routing leaves", async () => {
    const observations = createFakeTaxonomyObservationRepository(twoGroupCorpus(now))
    const clusters = createFakeTaxonomyClusterRepository([])

    const plan = await runPlan(observations, clusters, { now })

    expect(plan.mode).toBe("off")
    // Fresh births stage on every mode: the swap publishes a named tree.
    expect(plan.clusters.every((cluster) => cluster.state === "staging")).toBe(true)
    expect([...plan.stagedClusterIds].sort()).toEqual(plan.clusters.map((cluster) => cluster.id).sort())
    expect(plan.leafClusters).toEqual([])
    expect(plan.persistsAdaptiveTree).toBe(false)
    expect(plan.supersededClusterIds).toEqual([])
    expect(plan.decisionMetadata).toBeNull()
    expect(plan.observationAssignments.length).toBeGreaterThan(0)
    expect(plan.customAssignments).toEqual([])
  })

  it("scoped: active clusters (views publish in place), custom assignments, no staging machinery", async () => {
    const observations = createFakeTaxonomyObservationRepository(twoGroupCorpus(now))
    const clusters = createFakeTaxonomyClusterRepository([])
    const customBehaviorId = CustomBehaviorId("b".repeat(24))

    const plan = await runPlan(observations, clusters, { now, customBehaviorId })

    expect(plan.mode).toBe("off")
    expect(plan.customBehaviorId).toBe(customBehaviorId)
    expect(plan.clusters.every((cluster) => cluster.state === "active")).toBe(true)
    expect(plan.leafClusters).toEqual([])
    expect(plan.persistsAdaptiveTree).toBe(false)
    expect(plan.supersededClusterIds).toEqual([])
    expect(plan.decisionMetadata).toBeNull()
    expect(plan.observationAssignments).toEqual([])
    expect(plan.customAssignments.length).toBeGreaterThan(0)
  })

  it("adaptive scoped tags staging clusters + routing leaves with the behavior", async () => {
    const observations = createFakeTaxonomyObservationRepository(twoGroupCorpus(now))
    const clusters = createFakeTaxonomyClusterRepository([])
    const customBehaviorId = CustomBehaviorId("b".repeat(24))

    const plan = await runPlan(observations, clusters, { now, mode: "enforced", customBehaviorId })

    expect(plan.clusters.every((cluster) => cluster.state === "staging")).toBe(true)
    expect(plan.clusters.every((cluster) => cluster.customBehaviorId === customBehaviorId)).toBe(true)
    expect(plan.leafClusters.length).toBeGreaterThanOrEqual(2)
    // Both write-target arrays stay empty; the scoped full-window pass writes the slice.
    expect(plan.observationAssignments).toEqual([])
    expect(plan.customAssignments).toEqual([])
  })
})

const oneGroupCorpus = (at: Date): TaxonomyMomentObservation[] =>
  Array.from({ length: 40 }, (_, index) => makeObservation(index, 0, at))

// Records which builder each pass asked for, and otherwise builds normally.
const recordingBuilder = (): { readonly modes: string[]; readonly builder: TaxonomyClusterBuilder } => {
  const modes: string[] = []
  return {
    modes,
    builder: (request) =>
      Effect.sync(() => {
        modes.push(request.mode)
        return runTaxonomyClusterBuild(request)
      }),
  }
}

describe("exactly one tree is built per garden pass", () => {
  it("adaptive: builds only the adaptive tree — the static builder is never invoked", async () => {
    const recorder = recordingBuilder()

    const plan = await runPlan(
      createFakeTaxonomyObservationRepository(twoGroupCorpus(now)),
      createFakeTaxonomyClusterRepository([]),
      { now, mode: "enforced", clusterBuilder: recorder.builder },
    )

    expect(recorder.modes).toEqual(["enforced"])
    expect(plan.leafClusters.length).toBeGreaterThanOrEqual(2)
    expect(plan.decisionMetadata).not.toBeNull()
    expect(plan.adaptiveDurationMs).toBeGreaterThanOrEqual(0)
    // Nothing to report: the static builder never ran.
    expect(plan.staticDurationMs).toBe(0)
  })

  it("off: builds only the static tree", async () => {
    const recorder = recordingBuilder()

    const plan = await runPlan(
      createFakeTaxonomyObservationRepository(twoGroupCorpus(now)),
      createFakeTaxonomyClusterRepository([]),
      { now, clusterBuilder: recorder.builder },
    )

    expect(recorder.modes).toEqual(["off"])
    expect(plan.decisionMetadata).toBeNull()
    expect(plan.adaptiveDurationMs).toBe(0)
  })
})

describe("flipping the flag off reverts the next pass to static", () => {
  it("rebuilds static and retires the whole adaptive tree it replaces", async () => {
    const observations = createFakeTaxonomyObservationRepository(twoGroupCorpus(now))
    const clusters = createFakeTaxonomyClusterRepository([])

    // Pass one with the flag on, then simulate its atomic swap so the adaptive
    // tree is what the next pass sees as live.
    const adaptivePass = await runPlan(observations, clusters, { now, mode: "enforced" })
    for (const cluster of adaptivePass.clusters) clusters.clusters.set(cluster.id, { ...cluster, state: "active" })
    const adaptiveIds = new Set(adaptivePass.clusters.map((cluster) => cluster.id))

    const staticPass = await runPlan(observations, clusters, { now: new Date(now.getTime() + 6 * 60 * 60_000) })

    // Plain static publish path: sample assignments, no full-window routing leaves.
    expect(staticPass.mode).toBe("off")
    expect(staticPass.leafClusters).toEqual([])
    expect(staticPass.supersededClusterIds).toEqual([])
    expect(staticPass.observationAssignments.length).toBeGreaterThan(0)
    // Nothing from the adaptive tree is orphaned: every id it left active is either
    // continued in place by this plan or deprecated by it.
    const accountedFor = new Set([
      ...staticPass.deprecatedClusterIds.map((clusterId) => clusterId as string),
      ...staticPass.clusters.map((cluster) => cluster.id as string),
    ])
    for (const clusterId of adaptiveIds) expect(accountedFor.has(clusterId)).toBe(true)
  })
})

const badAdaptiveBuilder =
  (kind: "nonFinite" | "structuralLimit"): TaxonomyClusterBuilder =>
  (request) =>
    Effect.sync(() => {
      // Static baseline builds normally; only the adaptive candidate is corrupted.
      if (!isAdaptiveModeActive(request.mode)) return runTaxonomyClusterBuild(request)
      if (kind === "nonFinite") {
        const badLeaf: ClusteringTreeNode = { memberIndices: [0], centroid: [Number.NaN, 0], children: [], depth: 1 }
        return { root: { memberIndices: [0], centroid: [1, 0], children: [badLeaf], depth: 0 }, diagnostics: null }
      }
      const tooDeep = TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE.length + 2
      let node: ClusteringTreeNode = { memberIndices: [0], centroid: [1, 0], children: [], depth: tooDeep }
      for (let depth = tooDeep - 1; depth >= 0; depth--) {
        node = { memberIndices: [0], centroid: [1, 0], children: [node], depth }
      }
      return { root: node, diagnostics: null }
    })

describe("planHierarchicalTaxonomyUseCase enforced falls back to static on unsafe adaptive output", () => {
  it.each([
    "nonFinite",
    "structuralLimit",
  ] as const)("persists static and records fallbackReason=%s, before any staging/writes", async (kind) => {
    const observations = createFakeTaxonomyObservationRepository(twoGroupCorpus(now))
    const clusters = createFakeTaxonomyClusterRepository([])

    const plan = await runPlan(observations, clusters, {
      now,
      mode: "enforced",
      clusterBuilder: badAdaptiveBuilder(kind),
    })

    expect(plan.mode).toBe("enforced")
    expect(plan.fallbackReason).toBe(kind)
    // Fell back to the static publish path: sample assignments, no full-window leaves.
    expect(plan.clusters.length).toBeGreaterThan(0)
    expect(plan.clusters.every((cluster) => cluster.state === "staging")).toBe(true)
    expect(plan.leafClusters).toEqual([])
    // The publish path reads this, not the mode: a fallen-back `enforced` run
    // persists the static tree, so its swap must retire the dead ids only.
    expect(plan.persistsAdaptiveTree).toBe(false)
    expect(plan.supersededClusterIds).toEqual([])
    expect(plan.observationAssignments.length).toBeGreaterThan(0)
  })

  it("only then builds static — the fallback is the second build, never a speculative one", async () => {
    const modes: string[] = []
    const rejected = badAdaptiveBuilder("nonFinite")

    const plan = await runPlan(
      createFakeTaxonomyObservationRepository(twoGroupCorpus(now)),
      createFakeTaxonomyClusterRepository([]),
      {
        now,
        mode: "enforced",
        clusterBuilder: (request) => {
          modes.push(request.mode)
          return rejected(request)
        },
      },
    )

    expect(modes).toEqual(["enforced", "off"])
    expect(plan.fallbackReason).toBe("nonFinite")
    expect(plan.leafClusters).toEqual([])
  })

  it("persists adaptive (no fallback) when the real adaptive output is finite and sane", async () => {
    const observations = createFakeTaxonomyObservationRepository(twoGroupCorpus(now))
    const clusters = createFakeTaxonomyClusterRepository([])

    const plan = await runPlan(observations, clusters, { now, mode: "enforced" })

    expect(plan.fallbackReason).toBeNull()
    expect(plan.clusters.every((cluster) => cluster.state === "staging")).toBe(true)
    expect(plan.leafClusters.length).toBeGreaterThanOrEqual(2)
    expect(plan.persistsAdaptiveTree).toBe(true)
  })
})

describe("planHierarchicalTaxonomyUseCase degrades to static when the adaptive builder fails", () => {
  const rejectingAdaptiveBuilder: TaxonomyClusterBuilder = (request) =>
    isAdaptiveModeActive(request.mode)
      ? Effect.fail(new Error("adaptive worker crashed"))
      : Effect.sync(() => runTaxonomyClusterBuild(request))

  it("enforced: falls back to static with fallbackReason=buildError", async () => {
    const plan = await runPlan(
      createFakeTaxonomyObservationRepository(twoGroupCorpus(now)),
      createFakeTaxonomyClusterRepository([]),
      { now, mode: "enforced", clusterBuilder: rejectingAdaptiveBuilder },
    )

    expect(plan.mode).toBe("enforced")
    expect(plan.fallbackReason).toBe("buildError")
    expect(plan.clusters.every((cluster) => cluster.state === "staging")).toBe(true)
    expect(plan.leafClusters).toEqual([])
    expect(plan.observationAssignments.length).toBeGreaterThan(0)
  })

  // Catching outside `Effect.timed` reported 0 ms for every failure, so a build the
  // worker deadline killed looked identical to one that threw on arrival. The builder
  // here burns measurable time before failing, which is what makes the assertion
  // below fail under that shape rather than pass vacuously.
  it("enforced: a failed adaptive build reports why it failed and how long it ran", async () => {
    const slowRejectingBuilder: TaxonomyClusterBuilder = (request) =>
      isAdaptiveModeActive(request.mode)
        ? Effect.sleep(Duration.millis(20)).pipe(Effect.andThen(Effect.fail(new Error("adaptive worker crashed"))))
        : Effect.sync(() => runTaxonomyClusterBuild(request))

    const plan = await runPlan(
      createFakeTaxonomyObservationRepository(twoGroupCorpus(now)),
      createFakeTaxonomyClusterRepository([]),
      { now, mode: "enforced", clusterBuilder: slowRejectingBuilder },
    )

    expect(plan.fallbackReason).toBe("buildError")
    expect(plan.adaptiveBuildError).toBe("adaptive worker crashed")
    expect(plan.adaptiveDurationMs).toBeGreaterThan(0)
  })

  it("a successful adaptive build records no build error", async () => {
    const plan = await runPlan(
      createFakeTaxonomyObservationRepository(twoGroupCorpus(now)),
      createFakeTaxonomyClusterRepository([]),
      { now, mode: "enforced" },
    )

    expect(plan.fallbackReason).toBeNull()
    expect(plan.adaptiveBuildError).toBeNull()
  })
})

describe("adaptive structural guardrails hold across contrasting corpora", () => {
  it.each([
    ["two well-separated groups", twoGroupCorpus(now)],
    ["one tight unimodal group", oneGroupCorpus(now)],
  ] as const)("keeps the persisted tree within the node cap and schedule depth (%s)", async (_label, corpus) => {
    const plan = await runPlan(
      createFakeTaxonomyObservationRepository(corpus),
      createFakeTaxonomyClusterRepository([]),
      { now, mode: "enforced" },
    )

    // Within the guardrails the fallback check enforces, so a real corpus is
    // never rejected into static by shape alone.
    expect(plan.maxDepthReached).toBeLessThanOrEqual(TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE.length)
    expect(plan.clusters.length).toBeLessThanOrEqual(TAXONOMY_ADAPTIVE_STRUCTURAL_MAX_NODES)
    expect(plan.fallbackReason).toBeNull()
  })
})

// One vector repeated: identical sibling centroids, so no candidate split is accepted and both builders bare-root.
const unsplittableCorpus = (at: Date): TaxonomyMomentObservation[] =>
  Array.from({ length: 40 }, (_, index) => ({ ...makeObservation(index, 0, at), embedding: groupVector(0, 0) }))

const priorTree = (): TaxonomyCluster[] => {
  const root = "1".repeat(24)
  return [
    { id: root, parentClusterId: null, depth: 0, path: "" },
    { id: "2".repeat(24), parentClusterId: root, depth: 1, path: `${root}/` },
    { id: "3".repeat(24), parentClusterId: root, depth: 1, path: `${root}/` },
  ].map((node) =>
    taxonomyClusterSchema.parse({
      ...node,
      organizationId,
      projectId,
      customBehaviorId: null,
      dimension: "topic",
      splitLinkThreshold: null,
      name: `Prior ${node.depth}`,
      description: "A prior behaviour.",
      centroid: { base: groupVector(0, 0), mass: 1, model: "m", decay: 1, weights: { default: 1 } },
      observationCount: 10,
      state: "active",
      mergedIntoClusterId: null,
      firstObservedAt: now,
      lastObservedAt: now,
      clusteredAt: now,
      createdAt: now,
      updatedAt: now,
    }),
  )
}

describe("a degenerate rebuild is detectable before any publish branch runs", () => {
  it.each([
    "off",
    "enforced",
  ] as const)("reports topLevelClustersBuilt 0 and would retire the whole prior tree (%s)", async (mode) => {
    const plan = await runPlan(
      createFakeTaxonomyObservationRepository(unsplittableCorpus(now)),
      createFakeTaxonomyClusterRepository(priorTree()),
      { now, mode },
    )

    // Above the gardening minimum, so not a cold start: the build ran and produced a bare root.
    expect(plan.observationsSampled).toBe(40)
    expect(plan.topLevelClustersBuilt).toBe(0)
    expect(plan.clusters).toHaveLength(1)
    expect(plan.maxDepthReached).toBe(0)
    // What publishing would retire, on whichever branch this mode takes.
    const retired = [...plan.deprecatedClusterIds, ...plan.supersededClusterIds]
    expect(retired).toContain("2".repeat(24))
    expect(retired).toContain("3".repeat(24))
  })

  it("a healthy rebuild reports its top-level count, so the guard stays out of the way", async () => {
    const plan = await runPlan(
      createFakeTaxonomyObservationRepository(twoGroupCorpus(now)),
      createFakeTaxonomyClusterRepository(priorTree()),
      { now, mode: "enforced" },
    )

    expect(plan.topLevelClustersBuilt).toBeGreaterThanOrEqual(2)
    expect(plan.topLevelClustersBuilt).toBe(plan.clusters.filter((cluster) => cluster.depth === 1).length)
  })
})

describe("taxonomy cluster entity accepts the widened staging state", () => {
  it("round-trips a staging row through the Zod schema", () => {
    const staging: TaxonomyCluster = taxonomyClusterSchema.parse({
      id: "c".repeat(24),
      organizationId,
      projectId,
      customBehaviorId: null,
      dimension: "topic",
      parentClusterId: null,
      depth: 0,
      path: "",
      splitLinkThreshold: 0.7,
      name: "Pending",
      description: "",
      centroid: { base: [1, 0], mass: 1, model: "m", decay: 1, weights: { default: 1 } },
      observationCount: 0,
      state: "staging",
      mergedIntoClusterId: null,
      firstObservedAt: now,
      lastObservedAt: now,
      clusteredAt: now,
      createdAt: now,
      updatedAt: now,
    })
    expect(staging.state).toBe("staging")
  })
})

describe("atomic swap + staging cleanup (both global and scoped clusters)", () => {
  const makeStaging = (id: string, customBehaviorId: CustomBehaviorId | null): TaxonomyCluster =>
    taxonomyClusterSchema.parse({
      id,
      organizationId,
      projectId,
      customBehaviorId,
      dimension: "topic",
      parentClusterId: null,
      depth: 0,
      path: "",
      splitLinkThreshold: null,
      name: "Pending",
      description: "",
      centroid: { base: [1, 0], mass: 1, model: "m", decay: 1, weights: { default: 1 } },
      observationCount: 0,
      state: "staging",
      mergedIntoClusterId: null,
      firstObservedAt: now,
      lastObservedAt: now,
      clusteredAt: now,
      createdAt: now,
      updatedAt: now,
    })

  const runSwap = (
    clusters: ReturnType<typeof createFakeTaxonomyClusterRepository>,
    superseded: readonly string[],
    staging: readonly string[],
  ) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TaxonomyClusterRepository
        yield* repo.swapActiveTree({
          supersededClusterIds: superseded as TaxonomyClusterId[],
          stagingClusterIds: staging as TaxonomyClusterId[],
          timestamp: now,
        })
      }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

  it.each([
    ["global", null],
    ["scoped", CustomBehaviorId("b".repeat(24))],
  ] as const)("leaves exactly one active tree after the swap (%s)", async (_label, scope) => {
    const oldActive = { ...makeStaging("a".repeat(24), scope), state: "active" as const }
    const staging = makeStaging("d".repeat(24), scope)
    const clusters = createFakeTaxonomyClusterRepository([oldActive, staging])

    await runSwap(clusters, [oldActive.id], [staging.id])

    expect(clusters.clusters.get(oldActive.id)?.state).toBe("deprecated")
    expect(clusters.clusters.get(staging.id)?.state).toBe("active")
    const active = [...clusters.clusters.values()].filter((cluster) => cluster.state === "active")
    expect(active).toHaveLength(1)
    expect(active[0]?.id).toBe(staging.id)
  })

  it("is idempotent on retry (re-running the swap keeps one active tree)", async () => {
    const oldActive = { ...makeStaging("a".repeat(24), null), state: "active" as const }
    const staging = makeStaging("d".repeat(24), null)
    const clusters = createFakeTaxonomyClusterRepository([oldActive, staging])

    await runSwap(clusters, [oldActive.id], [staging.id])
    await runSwap(clusters, [oldActive.id], [staging.id])

    expect(clusters.clusters.get(oldActive.id)?.state).toBe("deprecated")
    expect(clusters.clusters.get(staging.id)?.state).toBe("active")
  })

  it("cleanup deletes abandoned staging rows and never touches the active tree", async () => {
    const oldActive = { ...makeStaging("a".repeat(24), null), state: "active" as const }
    const staging = makeStaging("d".repeat(24), null)
    const clusters = createFakeTaxonomyClusterRepository([oldActive, staging])

    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TaxonomyClusterRepository
        yield* repo.deleteStaging({ clusterIds: [oldActive.id, staging.id] as TaxonomyClusterId[] })
      }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    // Guarded to state='staging': the active tree survives, the orphan is gone.
    expect(clusters.clusters.get(oldActive.id)?.state).toBe("active")
    expect(clusters.clusters.has(staging.id)).toBe(false)
  })

  it("invariant: active reads never return a staging row", async () => {
    const active = { ...makeStaging("a".repeat(24), null), state: "active" as const }
    const staging = makeStaging("d".repeat(24), null)
    const clusters = createFakeTaxonomyClusterRepository([active, staging])

    const [activeByProject, listed] = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TaxonomyClusterRepository
        const byProject = yield* repo.listActiveByProject({ projectId, dimension: "topic" })
        const page = yield* repo.list({ projectId, dimension: "topic", limit: 50, offset: 0 })
        return [byProject, page.items] as const
      }).pipe(
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(activeByProject.map((cluster) => cluster.id)).toEqual([active.id])
    expect(listed.some((cluster) => cluster.state === "staging")).toBe(false)
  })
})
