import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import { ChSqlClient, OrganizationId, ProjectId, SessionId, SqlClient, TaxonomyRunId } from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { type TaxonomyCluster, taxonomyClusterSchema } from "../entities/cluster.ts"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import { isDisplayableTaxonomyName } from "../helpers.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"
import { createFakeTaxonomyClusterRepository } from "../testing/fake-taxonomy-cluster-repository.ts"
import { createFakeTaxonomyObservationRepository } from "../testing/fake-taxonomy-observation-repository.ts"
import { type HierarchicalTaxonomyPlan, planHierarchicalTaxonomyUseCase } from "./build-hierarchical-taxonomy.ts"
import { listProjectBehavioursUseCase } from "./list-project-behaviours.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const runId = TaxonomyRunId("r".repeat(24))
const now = new Date("2026-07-30T12:00:00.000Z")

// Two separable groups, so the build produces a root with two leaves.
const groupVector = (group: 0 | 1, jitterIndex: number): number[] => {
  const values = new Array<number>(EMBEDDING_DIMENSIONS).fill(0)
  values[group] = 1
  values[100 + group] = 0.03 * (jitterIndex % 5)
  return values
}

const observation = (index: number, group: 0 | 1, clusterId: string | null): TaxonomyMomentObservation => ({
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
  startTime: new Date(now.getTime() - index * 60_000),
  endTime: new Date(now.getTime() - index * 60_000 + 500),
  assignedClusterId: clusterId,
  assignmentConfidence: clusterId === null ? 0 : 0.9,
  assignmentMethod: clusterId === null ? "noise" : "gardening_birth",
  reassignmentRunId: null,
  retentionDays: 90,
  indexedAt: new Date(now.getTime() - index * 60_000),
})

// A previously-published tree whose centroids sit on an unrelated axis, so the
// lineage matcher continues nothing: every node of the new tree is a birth and
// the whole old tree dies. That is the shape production shows for a project
// whose taxonomy is rebuilt from scratch on every garden run.
const priorTree = (): readonly TaxonomyCluster[] => {
  const axis = (dimension: number) => {
    const values = new Array<number>(EMBEDDING_DIMENSIONS).fill(0)
    values[dimension] = 1
    return values
  }
  const node = (input: {
    readonly id: string
    readonly parentClusterId: string | null
    readonly depth: number
    readonly name: string
    readonly dimension: number
  }): TaxonomyCluster =>
    taxonomyClusterSchema.parse({
      id: input.id,
      organizationId,
      projectId,
      customBehaviorId: null,
      facetId: null,
      dimension: "topic",
      parentClusterId: input.parentClusterId,
      depth: input.depth,
      path: input.parentClusterId === null ? "" : `${input.parentClusterId}/`,
      splitLinkThreshold: null,
      name: input.name,
      description: `The ${input.name} node of the tree serving reads before the rebuild.`,
      centroid: { base: axis(input.dimension), mass: 20, model: "m", decay: 1, weights: { default: 1 } },
      observationCount: 20,
      state: "active",
      mergedIntoClusterId: null,
      firstObservedAt: new Date(now.getTime() - 7 * 24 * 60 * 60_000),
      lastObservedAt: now,
      clusteredAt: now,
      createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60_000),
      updatedAt: now,
    })
  const root = "a".repeat(24)
  return [
    node({ id: root, parentClusterId: null, depth: 0, name: "Prior Umbrella", dimension: 900 }),
    node({ id: "b".repeat(24), parentClusterId: root, depth: 1, name: "Prior Billing", dimension: 901 }),
    node({ id: "c".repeat(24), parentClusterId: root, depth: 1, name: "Prior Order Status", dimension: 902 }),
  ]
}

const corpus = (): TaxonomyMomentObservation[] =>
  Array.from({ length: 40 }, (_, index) =>
    observation(index, index < 20 ? 0 : 1, index < 20 ? "b".repeat(24) : "c".repeat(24)),
  )

type Fakes = {
  readonly observations: ReturnType<typeof createFakeTaxonomyObservationRepository>
  readonly clusters: ReturnType<typeof createFakeTaxonomyClusterRepository>
}

const withLayers = <A, E>(
  fakes: Fakes,
  effect: Effect.Effect<A, E, TaxonomyObservationRepository | TaxonomyClusterRepository | SqlClient | ChSqlClient>,
) =>
  effect.pipe(
    Effect.provide(Layer.succeed(TaxonomyObservationRepository, fakes.observations.repository)),
    Effect.provide(Layer.succeed(TaxonomyClusterRepository, fakes.clusters.repository)),
    Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
    Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
  )

const plan = (fakes: Fakes, mode?: "off" | "enforced"): Promise<HierarchicalTaxonomyPlan> =>
  Effect.runPromise(
    withLayers(
      fakes,
      planHierarchicalTaxonomyUseCase({
        organizationId,
        projectId,
        runId,
        dimension: "topic",
        now,
        ...(mode ? { mode } : {}),
      }),
    ),
  )

const readTopics = (fakes: Fakes) =>
  Effect.runPromise(
    withLayers(fakes, listProjectBehavioursUseCase({ organizationId, projectId, dimension: "topic", now })),
  )

// The publish steps, in the order the gardening activities run them.
const savePlanClusters = (fakes: Fakes, published: HierarchicalTaxonomyPlan) => {
  for (const cluster of published.clusters) fakes.clusters.clusters.set(cluster.id, cluster)
}

const nameClusters = (fakes: Fakes, clusterIds: readonly string[]) => {
  for (const [index, clusterId] of clusterIds.entries()) {
    const cluster = fakes.clusters.clusters.get(clusterId as TaxonomyCluster["id"])
    if (!cluster) continue
    fakes.clusters.clusters.set(cluster.id, {
      ...cluster,
      name: `Rebuilt Topic ${index}`,
      description: `A named topic produced by the rebuild pass number ${index}.`,
    })
  }
}

const reassignAndPublish = async (fakes: Fakes, published: HierarchicalTaxonomyPlan) => {
  await Effect.runPromise(
    withLayers(
      fakes,
      Effect.gen(function* () {
        const observations = yield* TaxonomyObservationRepository
        yield* observations.reassignManyById({
          organizationId,
          projectId,
          assignments: published.observationAssignments,
        })
      }),
    ),
  )
  for (const clusterId of published.deprecatedClusterIds) {
    const cluster = fakes.clusters.clusters.get(clusterId)
    if (cluster) fakes.clusters.clusters.set(clusterId, { ...cluster, state: "deprecated" })
  }
  for (const clusterId of published.stagedClusterIds) {
    const cluster = fakes.clusters.clusters.get(clusterId)
    if (cluster?.state === "staging") fakes.clusters.clusters.set(clusterId, { ...cluster, state: "active" })
  }
}

const activeUnnamed = (fakes: Fakes): readonly string[] =>
  [...fakes.clusters.clusters.values()]
    .filter((cluster) => cluster.state === "active" && !isDisplayableTaxonomyName(cluster.name))
    .map((cluster) => cluster.id as string)

describe("a taxonomy rebuild never blanks the Behaviours read", () => {
  const freshFakes = (): Fakes => ({
    observations: createFakeTaxonomyObservationRepository(corpus()),
    clusters: createFakeTaxonomyClusterRepository(priorTree()),
  })

  it("keeps topics non-empty at every publish step of a full rebuild (off/static persist)", async () => {
    const fakes = freshFakes()
    expect((await readTopics(fakes)).topics.length).toBeGreaterThan(0)

    const published = await plan(fakes)
    // Nothing continued, so this is the worst case: a brand-new tree replaces the
    // whole old one and every node starts out "Pending".
    expect(published.clustersContinued).toBe(0)
    expect(published.stagedClusterIds.length).toBe(published.clusters.length)

    savePlanClusters(fakes, published)
    // Staged clusters are invisible to reads, so the old tree still serves.
    expect((await readTopics(fakes)).topics.length).toBeGreaterThan(0)
    expect(activeUnnamed(fakes)).toEqual([])

    nameClusters(
      fakes,
      published.clusters.map((cluster) => cluster.id as string),
    )
    expect((await readTopics(fakes)).topics.length).toBeGreaterThan(0)

    // The reassignment moves the counts and the swap publishes in the same step,
    // so there is no instant where the counts point at an invisible tree.
    await reassignAndPublish(fakes, published)
    const afterPublish = await readTopics(fakes)
    expect(afterPublish.topics.length).toBeGreaterThan(0)
    expect(activeUnnamed(fakes)).toEqual([])
    // Reads now show the rebuilt tree, not the retired one.
    expect(afterPublish.topics.every((topic) => topic.cluster.name.startsWith("Rebuilt Topic"))).toBe(true)
  })

  it("stages the adaptive tree the same way, so enforced rebuilds never blank either", async () => {
    const fakes = freshFakes()
    const published = await plan(fakes, "enforced")

    expect(published.clusters.every((cluster) => cluster.state === "staging")).toBe(true)
    savePlanClusters(fakes, published)
    expect((await readTopics(fakes)).topics.length).toBeGreaterThan(0)
    expect(activeUnnamed(fakes)).toEqual([])
  })

  it("blanks when an unnamed tree is published — the shape this fix removes", async () => {
    const fakes = freshFakes()
    const published = await plan(fakes)

    // Reproduce the old order: activate the new tree and move the counts onto it
    // while its names are still "Pending".
    savePlanClusters(fakes, published)
    for (const cluster of published.clusters) {
      fakes.clusters.clusters.set(cluster.id, { ...cluster, state: "active" })
    }
    await reassignAndPublish(fakes, published)

    // Pending names are filtered out of the read, so the page has no topics at all
    // even though Postgres holds a healthy active tree with populated counts.
    expect(activeUnnamed(fakes).length).toBeGreaterThan(0)
    expect((await readTopics(fakes)).topics).toEqual([])
  })
})
