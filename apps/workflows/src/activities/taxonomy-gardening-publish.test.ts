import { FacetId, OrganizationId, ProjectId, SessionId, type TaxonomyClusterId } from "@domain/shared"
import {
  type ReassignTaxonomyObservationByIdInput,
  TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
  type TaxonomyCluster,
  type TaxonomyFacetProjection,
  type TaxonomyMomentObservation,
  type TaxonomyViewAssignment,
  taxonomyClusterSchema,
} from "@domain/taxonomy"
import {
  createFakeFacetProjectionRepository,
  createFakeTaxonomyClusterRepository,
  createFakeTaxonomyObservationRepository,
  createFakeTaxonomyViewAssignmentRepository,
} from "@domain/taxonomy/testing"
import { silenceLoggerInTests } from "@repo/vitest-config/silence-logger"
import { Effect } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"

// These activities own the publish order and the id sets the swap acts on. They reach
// Postgres/ClickHouse/Redis through module singletons, so the seams are mocked as in
// `evaluation-alignment-activities.test.ts`: domain fakes behind `withPostgres` /
// `withClickHouse`, plus an in-memory stand-in for the Redis plan artifact.
const { fakes, redis, calls } = vi.hoisted(() => ({
  fakes: {
    clusters: null as unknown,
    observations: null as unknown,
    viewAssignments: null as unknown,
    facetProjections: null as unknown,
  },
  redis: new Map<string, string>(),
  calls: [] as string[],
}))

vi.mock("../clients.ts", () => ({
  getPostgresClient: () => ({}),
  getClickhouseClient: () => ({}),
  getRedisClient: () => ({
    get: async (key: string) => redis.get(key) ?? null,
    set: async (key: string, value: string) => {
      redis.set(key, value)
      return "OK"
    },
  }),
}))

vi.mock("@platform/db-postgres", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  const { Effect: E, Layer: L } = await import("effect")
  const domain = (await vi.importActual("@domain/taxonomy")) as typeof import("@domain/taxonomy")
  const shared = (await vi.importActual("@domain/shared")) as typeof import("@domain/shared")
  const testing = (await vi.importActual("@domain/shared/testing")) as typeof import("@domain/shared/testing")
  return {
    ...actual,
    withPostgres:
      () =>
      <A, Err, R>(effect: Effect.Effect<A, Err, R>) =>
        effect.pipe(
          E.provide(L.succeed(domain.TaxonomyClusterRepository, fakes.clusters as never)),
          E.provide(L.succeed(shared.SqlClient, testing.createFakeSqlClient())),
        ),
  }
})

vi.mock("@platform/db-clickhouse", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  const { Effect: E, Layer: L } = await import("effect")
  const domain = (await vi.importActual("@domain/taxonomy")) as typeof import("@domain/taxonomy")
  const shared = (await vi.importActual("@domain/shared")) as typeof import("@domain/shared")
  const testing = (await vi.importActual("@domain/shared/testing")) as typeof import("@domain/shared/testing")
  return {
    ...actual,
    withClickHouse:
      () =>
      <A, Err, R>(effect: Effect.Effect<A, Err, R>) =>
        effect.pipe(
          E.provide(L.succeed(domain.TaxonomyObservationRepository, fakes.observations as never)),
          E.provide(L.succeed(domain.TaxonomyViewAssignmentRepository, fakes.viewAssignments as never)),
          E.provide(L.succeed(domain.FacetProjectionRepository, fakes.facetProjections as never)),
          E.provide(L.succeed(shared.ChSqlClient, testing.createFakeChSqlClient())),
        ),
  }
})

import {
  cleanupGardenTaxonomyStagingActivity,
  deprecateGardenTaxonomyClustersActivity,
  planGardenTaxonomyNamingActivity,
  reassignGardenTaxonomyObservationsActivity,
} from "./taxonomy-gardening-activities.ts"

silenceLoggerInTests()

const organizationId = "o".repeat(24)
const projectId = "p".repeat(24)
const runId = "r".repeat(24)
const now = new Date("2026-07-30T12:00:00.000Z")
const planKey = `org:${organizationId}:taxonomy:gardenPlan:${runId}`

const OLD_ROOT = "a".repeat(24)
const OLD_LEAF = "b".repeat(24)
const NEW_ROOT = "c".repeat(24)
const NEW_LEAF = "d".repeat(24)
const BEHAVIOR = "e".repeat(24)
const FACET = "f".repeat(24)

const cluster = (input: {
  readonly id: string
  readonly parentClusterId: string | null
  readonly name: string
  readonly state: TaxonomyCluster["state"]
}): TaxonomyCluster =>
  taxonomyClusterSchema.parse({
    id: input.id,
    organizationId,
    projectId,
    customBehaviorId: null,
    facetId: null,
    dimension: "topic",
    parentClusterId: input.parentClusterId,
    depth: input.parentClusterId === null ? 0 : 1,
    path: input.parentClusterId === null ? "" : `${input.parentClusterId}/`,
    splitLinkThreshold: null,
    name: input.name,
    description: input.name === "Pending" ? "" : `Description of ${input.name}.`,
    centroid: { base: [1, 0], mass: 1, model: "m", decay: 1, weights: { default: 1 } },
    observationCount: 5,
    state: input.state,
    mergedIntoClusterId: null,
    firstObservedAt: now,
    lastObservedAt: now,
    clusteredAt: now,
    createdAt: now,
    updatedAt: now,
  })

const stepInput = {
  organizationId,
  projectId,
  dimension: "topic" as const,
  trigger: "manual" as const,
  workflowId: `org:${organizationId}:taxonomy:garden:${projectId}:topic`,
  runId,
  now: now.toISOString(),
}

type StoredPlan = {
  readonly clusters: readonly TaxonomyCluster[]
  readonly observationAssignments: readonly unknown[]
  readonly customAssignments: readonly unknown[]
  readonly customBehaviorId: string | null
  readonly facetId: string | null
  readonly deprecatedClusterIds: readonly string[]
  readonly mode: string
  readonly fallbackReason: null
  readonly leafClusters: readonly { readonly clusterId: string; readonly centroid: readonly number[] }[]
  readonly persistsAdaptiveTree?: boolean | undefined
  readonly supersededClusterIds: readonly string[]
  readonly stagedClusterIds?: readonly string[] | undefined
  readonly namingMembers?:
    | readonly { readonly clusterId: string; readonly observationIds: readonly string[] }[]
    | undefined
  readonly continuedRestore?:
    | readonly {
        readonly clusterId: string
        readonly parentClusterId: string | null
        readonly path: string
        readonly depth: number
        readonly name: string
        readonly description: string
      }[]
    | undefined
}

const storePlan = (overrides: Partial<StoredPlan> = {}) => {
  const plan: StoredPlan = {
    clusters: [
      cluster({ id: NEW_ROOT, parentClusterId: null, name: "Rebuilt Umbrella", state: "staging" }),
      cluster({ id: NEW_LEAF, parentClusterId: NEW_ROOT, name: "Rebuilt Leaf", state: "staging" }),
    ],
    observationAssignments: [],
    customAssignments: [],
    customBehaviorId: null,
    facetId: null,
    deprecatedClusterIds: [OLD_ROOT, OLD_LEAF],
    mode: "off",
    fallbackReason: null,
    leafClusters: [],
    persistsAdaptiveTree: false,
    supersededClusterIds: [],
    stagedClusterIds: [NEW_ROOT, NEW_LEAF],
    namingMembers: [{ clusterId: NEW_LEAF, observationIds: ["obs-1", "obs-2"] }],
    continuedRestore: [],
    ...overrides,
  }
  redis.set(planKey, JSON.stringify(plan))
  return plan
}

const viewUpserts: TaxonomyViewAssignment[] = []
const observationReassignments: ReassignTaxonomyObservationByIdInput[] = []

// A live-window row the full-window reassignment can route: the only fields that
// path reads are the id, session, embedding and start time.
const windowObservation = (index: number): TaxonomyMomentObservation => ({
  organizationId: OrganizationId(organizationId),
  projectId: ProjectId(projectId),
  observationId: String(index).padStart(24, "w").slice(0, 24),
  sessionId: SessionId(`session-${index}`),
  analysisHash: String(index).repeat(64).slice(0, 64),
  momentId: `moment-${index}`,
  projectionMethod: "moment_text_embedding",
  projectionHash: String(index).repeat(64).slice(0, 64),
  projectionMetadata: { summary: `Observation ${index}` },
  embedding: [1, 0],
  startTime: new Date(now.getTime() - index * 60_000),
  endTime: new Date(now.getTime() - index * 60_000 + 500),
  assignedClusterId: null,
  assignmentConfidence: 0,
  assignmentMethod: "noise",
  reassignmentRunId: null,
  retentionDays: 90,
  indexedAt: now,
})

// Same row, but sitting below the fit floor relative to the [1, 0] leaf centroid, so
// full-window routing must reject it instead of filing it on the nearest leaf.
const belowFloorObservation = (index: number): TaxonomyMomentObservation => {
  const cosine = TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD - 0.05
  return { ...windowObservation(index), embedding: [cosine, Math.sqrt(1 - cosine ** 2)] }
}

// A cached facet projection: the row the projection-space window routes. Its
// embedding is deliberately orthogonal to the observation embedding above, so a
// test can tell which space a pass actually read.
const windowProjection = (index: number): TaxonomyFacetProjection => ({
  organizationId: OrganizationId(organizationId),
  projectId: ProjectId(projectId),
  facetId: FacetId(FACET),
  sessionObservationId: String(index).padStart(24, "j").slice(0, 24),
  sessionId: SessionId(`facet-session-${index}`),
  extractedText: `Projection ${index}`,
  analysisHash: String(index).repeat(64).slice(0, 64),
  embedding: [0, 1],
  startTime: new Date(now.getTime() - index * 60_000),
  retentionDays: 90,
  indexedAt: now,
})

const seedRepositories = (
  seed: readonly TaxonomyCluster[],
  window: readonly TaxonomyMomentObservation[] = [],
  projections: readonly TaxonomyFacetProjection[] = [],
) => {
  const clusters = createFakeTaxonomyClusterRepository(seed, {
    swapActiveTree: (input) => {
      calls.push("swap")
      return Effect.sync(() => {
        for (const id of input.supersededClusterIds) {
          const existing = clusters.clusters.get(id)
          if (existing) clusters.clusters.set(id, { ...existing, state: "deprecated" })
        }
        for (const id of input.stagingClusterIds) {
          const existing = clusters.clusters.get(id)
          if (existing?.state === "staging") clusters.clusters.set(id, { ...existing, state: "active" })
        }
      })
    },
  })
  const observations = createFakeTaxonomyObservationRepository(window, {
    reassignManyById: ({ assignments }) => {
      calls.push("reassign")
      return Effect.sync(() => {
        observationReassignments.push(...assignments)
      })
    },
  })
  const viewAssignments = createFakeTaxonomyViewAssignmentRepository(
    {},
    {
      upsertMany: (rows) =>
        Effect.sync(() => {
          calls.push("view-upsert")
          viewUpserts.push(...rows)
        }),
    },
  )
  fakes.clusters = clusters.repository
  fakes.observations = observations.repository
  fakes.viewAssignments = viewAssignments.repository
  fakes.facetProjections = createFakeFacetProjectionRepository(projections).repository
  return clusters
}

const publishedTree = () => [
  cluster({ id: OLD_ROOT, parentClusterId: null, name: "Prior Umbrella", state: "active" }),
  cluster({ id: OLD_LEAF, parentClusterId: OLD_ROOT, name: "Prior Leaf", state: "active" }),
  cluster({ id: NEW_ROOT, parentClusterId: null, name: "Rebuilt Umbrella", state: "staging" }),
  cluster({ id: NEW_LEAF, parentClusterId: NEW_ROOT, name: "Rebuilt Leaf", state: "staging" }),
]

const stateOf = (clusters: ReturnType<typeof seedRepositories>, id: string) =>
  clusters.clusters.get(id as TaxonomyClusterId)?.state

describe("taxonomy gardening publish activities", () => {
  beforeEach(() => {
    redis.clear()
    calls.length = 0
    viewUpserts.length = 0
    observationReassignments.length = 0
  })

  it("publishes in the same activity as the reassignment, reassign first", async () => {
    const clusters = seedRepositories(publishedTree())
    storePlan()

    await reassignGardenTaxonomyObservationsActivity({ ...stepInput, planKey })

    // The ClickHouse write is what moves the counts the Behaviours read gates on,
    // so the swap must follow it inside the same activity — anything in between is
    // a window where neither tree is visible.
    expect(calls).toEqual(["reassign", "swap"])
    expect(stateOf(clusters, NEW_ROOT)).toBe("active")
    expect(stateOf(clusters, NEW_LEAF)).toBe("active")
    expect(stateOf(clusters, OLD_ROOT)).toBe("deprecated")
    expect(stateOf(clusters, OLD_LEAF)).toBe("deprecated")
  })

  it("is idempotent when the following activity re-runs the publish", async () => {
    const clusters = seedRepositories(publishedTree())
    storePlan()

    await reassignGardenTaxonomyObservationsActivity({ ...stepInput, planKey })
    const result = await deprecateGardenTaxonomyClustersActivity({ ...stepInput, planKey })

    // Activation is guarded to `state = 'staging'`, so the repeat swap cannot
    // resurrect the retired tree or double-publish.
    expect(stateOf(clusters, NEW_ROOT)).toBe("active")
    expect(stateOf(clusters, OLD_ROOT)).toBe("deprecated")
    expect(result).toEqual(expect.objectContaining({ clustersDeprecated: 2, clustersActivated: 2 }))
  })

  it("deletes the staged tree on a static plan too, so a failed run leaks nothing", async () => {
    const clusters = seedRepositories(publishedTree())
    // A static plan stages fresh clusters but has no adaptive routing leaves, so
    // gating cleanup on the adaptive shape leaked one staging tree per failed run.
    storePlan()

    const result = await cleanupGardenTaxonomyStagingActivity({
      organizationId,
      projectId,
      dimension: "topic",
      trigger: "manual",
      taxonomyRunId: runId,
    } as never)

    expect(result).toEqual(expect.objectContaining({ stagingDeleted: 2 }))
    expect(clusters.clusters.get(NEW_ROOT as TaxonomyClusterId)).toBeUndefined()
    expect(clusters.clusters.get(NEW_LEAF as TaxonomyClusterId)).toBeUndefined()
    // The tree that was serving reads is untouched.
    expect(stateOf(clusters, OLD_ROOT)).toBe("active")
    expect(stateOf(clusters, OLD_LEAF)).toBe("active")
  })

  it("restores the rows a failed publish overwrote in place, so no live node is orphaned", async () => {
    // The worst shape: a continuation whose id was reused, re-parented under a node
    // this run staged. Deleting staging alone would leave it pointing at a row that
    // no longer exists, so the read could not reach it or its subtree.
    const continued = {
      ...cluster({ id: OLD_LEAF, parentClusterId: NEW_ROOT, name: "Pending", state: "active" }),
      depth: 1,
    }
    const clusters = seedRepositories([
      cluster({ id: OLD_ROOT, parentClusterId: null, name: "Prior Umbrella", state: "active" }),
      continued,
      cluster({ id: NEW_ROOT, parentClusterId: null, name: "Rebuilt Umbrella", state: "staging" }),
      cluster({ id: NEW_LEAF, parentClusterId: NEW_ROOT, name: "Rebuilt Leaf", state: "staging" }),
    ])
    storePlan({
      continuedRestore: [
        {
          clusterId: OLD_LEAF,
          parentClusterId: OLD_ROOT,
          path: `${OLD_ROOT}/`,
          depth: 1,
          name: "Prior Leaf",
          description: "Description of Prior Leaf.",
        },
      ],
    })

    const result = await cleanupGardenTaxonomyStagingActivity({
      organizationId,
      projectId,
      dimension: "topic",
      trigger: "manual",
      taxonomyRunId: runId,
    } as never)

    expect(result).toEqual(expect.objectContaining({ stagingDeleted: 2, continuationsRestored: 1 }))
    const restored = clusters.clusters.get(OLD_LEAF as TaxonomyClusterId)
    // Reachable from the prior root again, under its prior name — not the staged parent.
    expect(restored?.parentClusterId).toBe(OLD_ROOT)
    expect(restored?.path).toBe(`${OLD_ROOT}/`)
    expect(restored?.name).toBe("Prior Leaf")
    expect(restored?.state).toBe("active")
  })

  it("retires the whole previous tree on an adaptive plan, the dead ids on a static one", async () => {
    const staticClusters = seedRepositories(publishedTree())
    storePlan()
    await deprecateGardenTaxonomyClustersActivity({ ...stepInput, planKey })
    // Static continuations keep their id and stay active, so only the ids the plan
    // recorded as deaths are retired.
    expect(stateOf(staticClusters, OLD_LEAF)).toBe("deprecated")

    const adaptiveClusters = seedRepositories(publishedTree())
    storePlan({
      mode: "enforced",
      deprecatedClusterIds: [],
      supersededClusterIds: [OLD_ROOT, OLD_LEAF],
      leafClusters: [{ clusterId: NEW_LEAF, centroid: [1, 0] }],
      persistsAdaptiveTree: true,
    })
    await deprecateGardenTaxonomyClustersActivity({ ...stepInput, planKey })

    expect(stateOf(adaptiveClusters, OLD_ROOT)).toBe("deprecated")
    expect(stateOf(adaptiveClusters, OLD_LEAF)).toBe("deprecated")
    expect(stateOf(adaptiveClusters, NEW_ROOT)).toBe("active")
  })

  // Staging leaves and an adaptive tree are two different facts about a plan, and
  // publication reads the second one. No plan carries the first without the second
  // in production today — LAT-862 Part 2b gives facet lenses one — so the case is
  // pinned by fixture rather than by trust. A cohort scope keeps it about the two
  // predicates; the facet write target is Part 2b's problem.
  const leavesWithoutAdaptiveTree = (overrides: Partial<StoredPlan> = {}) =>
    storePlan({
      customBehaviorId: BEHAVIOR,
      mode: "off",
      persistsAdaptiveTree: false,
      leafClusters: [{ clusterId: NEW_LEAF, centroid: [1, 0] }],
      // A statically-persisted view saves its tree active, so nothing is staged.
      clusters: [
        cluster({ id: NEW_ROOT, parentClusterId: null, name: "Rebuilt Umbrella", state: "active" }),
        cluster({ id: NEW_LEAF, parentClusterId: NEW_ROOT, name: "Rebuilt Leaf", state: "active" }),
      ],
      stagedClusterIds: [],
      deprecatedClusterIds: [OLD_LEAF],
      supersededClusterIds: [],
      ...overrides,
    })

  it("routes the full window but retires only the dead ids when a plan has leaves without an adaptive tree", async () => {
    const clusters = seedRepositories(publishedTree(), [windowObservation(1), windowObservation(2)])
    leavesWithoutAdaptiveTree()

    const result = await deprecateGardenTaxonomyClustersActivity({ ...stepInput, planKey })

    // Leaves ⇒ the catch-up pass runs: routing follows the plan's SHAPE.
    expect(calls).toContain("view-upsert")
    expect(viewUpserts).toHaveLength(2)
    // Not an adaptive tree ⇒ the swap retires the ids no node continued, never the
    // whole prior tree. Retiring it wholesale here would deprecate the live rows a
    // static persist upserted its continuations onto.
    expect(stateOf(clusters, OLD_LEAF)).toBe("deprecated")
    expect(stateOf(clusters, OLD_ROOT)).toBe("active")
    expect(result).toEqual(expect.objectContaining({ clustersDeprecated: 1, clustersActivated: 0 }))
  })

  // The fit floor's own path through the activities (LAT-866): every other full-window
  // fixture routes an exact-centroid or orthogonal embedding, so none of them reaches
  // the rejection branch these two assert.
  it("writes a below-floor observation as noise rather than filing it on the nearest leaf", async () => {
    seedRepositories(publishedTree(), [windowObservation(1), belowFloorObservation(2)])
    storePlan({
      mode: "enforced",
      deprecatedClusterIds: [],
      supersededClusterIds: [OLD_ROOT, OLD_LEAF],
      leafClusters: [{ clusterId: NEW_LEAF, centroid: [1, 0] }],
      persistsAdaptiveTree: true,
    })

    const result = await reassignGardenTaxonomyObservationsActivity({ ...stepInput, planKey })

    expect(result).toEqual(expect.objectContaining({ observationsReassigned: 1, observationsRejected: 1 }))
    const rejected = observationReassignments.filter((row) => row.assignmentMethod === "noise")
    expect(rejected).toHaveLength(1)
    // Null, not the nearest leaf — the whole point of the floor on this path.
    expect(rejected[0]?.assignedClusterId).toBeNull()
    // The measured similarity survives the rejection, so the write is diagnosable.
    expect(rejected[0]?.assignmentConfidence).toBeCloseTo(TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD - 0.05, 4)
    expect(observationReassignments.filter((row) => row.assignmentMethod === "gardening_reassign")).toHaveLength(1)
  })

  it("writes the rejection into the view slice too on a scoped full-window plan", async () => {
    seedRepositories(publishedTree(), [windowObservation(1), belowFloorObservation(2)])
    storePlan({
      customBehaviorId: BEHAVIOR,
      mode: "enforced",
      deprecatedClusterIds: [],
      supersededClusterIds: [OLD_ROOT, OLD_LEAF],
      leafClusters: [{ clusterId: NEW_LEAF, centroid: [1, 0] }],
      persistsAdaptiveTree: true,
    })

    const result = await reassignGardenTaxonomyObservationsActivity({ ...stepInput, planKey })

    expect(result).toEqual(expect.objectContaining({ observationsReassigned: 1, observationsRejected: 1 }))
    const rejected = viewUpserts.filter((row) => row.assignmentMethod === "noise")
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.assignedClusterId).toBeNull()
    // The global column must stay untouched for a view.
    expect(observationReassignments).toHaveLength(0)
  })

  // LAT-862 Part 2b: a facet lens's coverage is the projection cache, not the
  // 7-day sample, so its passes route `taxonomy_facet_projections`.
  const facetPlan = (overrides: Partial<StoredPlan> = {}) => leavesWithoutAdaptiveTree({ facetId: FACET, ...overrides })

  it("routes the facet's projection cache, not the observation window, and stamps the facet on every edge", async () => {
    seedRepositories(
      publishedTree(),
      [windowObservation(1), windowObservation(2)],
      [windowProjection(1), windowProjection(2), windowProjection(3)],
    )
    facetPlan()

    await reassignGardenTaxonomyObservationsActivity({ ...stepInput, planKey })

    // Three cached projections, two observations: reading the wrong table is
    // visible in the count, and the sessions come from the projection rows.
    expect(viewUpserts).toHaveLength(3)
    expect(viewUpserts.every((row) => row.facetId === FACET)).toBe(true)
    expect(viewUpserts.every((row) => (row.sessionId as string).startsWith("facet-session-"))).toBe(true)
    // The inline column belongs to the global topic tree; a facet never writes it.
    expect(calls).not.toContain("reassign")
  })

  it("catches the facet up in projection space after the swap", async () => {
    seedRepositories(publishedTree(), [windowObservation(1)], [windowProjection(1), windowProjection(2)])
    facetPlan()

    await deprecateGardenTaxonomyClustersActivity({ ...stepInput, planKey })

    // Without this the coverage is correct at reassign time and stale the moment
    // the swap lands.
    expect(viewUpserts).toHaveLength(2)
    expect(viewUpserts.every((row) => row.facetId === FACET)).toBe(true)
    expect(calls).not.toContain("reassign")
  })

  it("never reassigns the global column for a whole-project facet with no behavior", async () => {
    // A facet plan that carries no cohort has no slice row to write (the slice is
    // keyed by behavior). Falling through to the global branch would overwrite
    // every project observation's `assigned_cluster_id` with facet cluster ids.
    seedRepositories(publishedTree(), [windowObservation(1)], [windowProjection(1)])
    facetPlan({ customBehaviorId: null })

    await reassignGardenTaxonomyObservationsActivity({ ...stepInput, planKey })
    await deprecateGardenTaxonomyClustersActivity({ ...stepInput, planKey })

    expect(calls).not.toContain("reassign")
    expect(viewUpserts).toHaveLength(0)
  })

  it("activates nothing on a pre-change-shaped plan with leaves but no adaptive tree", async () => {
    const clusters = seedRepositories(publishedTree(), [windowObservation(1)])
    // Without `stagedClusterIds` the publish falls back to the whole cluster set,
    // but only for an adaptive tree — a static view's rows are already active.
    leavesWithoutAdaptiveTree({ stagedClusterIds: undefined, namingMembers: undefined })

    const result = await deprecateGardenTaxonomyClustersActivity({ ...stepInput, planKey })

    expect(result).toEqual(expect.objectContaining({ clustersActivated: 0 }))
    expect(stateOf(clusters, NEW_ROOT)).toBe("staging")
  })

  it("falls back to the plan's whole cluster set on a pre-change adaptive plan", async () => {
    const clusters = seedRepositories(publishedTree())
    // Pre-change plans carry no `persistsAdaptiveTree`; their staging leaves are
    // the only signal that this was an adaptive tree, and it still has to work.
    storePlan({
      mode: "enforced",
      supersededClusterIds: [OLD_ROOT, OLD_LEAF],
      leafClusters: [{ clusterId: NEW_LEAF, centroid: [1, 0] }],
      persistsAdaptiveTree: undefined,
      stagedClusterIds: undefined,
      namingMembers: undefined,
    })

    await deprecateGardenTaxonomyClustersActivity({ ...stepInput, planKey })

    // A plan staged before this change carries no `stagedClusterIds`; its clusters
    // were all staging, so the swap still activates them.
    expect(stateOf(clusters, NEW_ROOT)).toBe("active")
    expect(stateOf(clusters, NEW_LEAF)).toBe("active")
  })

  it("activates nothing on a pre-change static plan (it saved its tree active)", async () => {
    const clusters = seedRepositories([
      cluster({ id: OLD_ROOT, parentClusterId: null, name: "Prior Umbrella", state: "active" }),
      cluster({ id: OLD_LEAF, parentClusterId: OLD_ROOT, name: "Prior Leaf", state: "active" }),
      cluster({ id: NEW_ROOT, parentClusterId: null, name: "Rebuilt Umbrella", state: "active" }),
    ])
    storePlan({ stagedClusterIds: undefined, namingMembers: undefined })

    const result = await deprecateGardenTaxonomyClustersActivity({ ...stepInput, planKey })

    expect(result).toEqual(expect.objectContaining({ clustersDeprecated: 2, clustersActivated: 0 }))
    expect(stateOf(clusters, OLD_ROOT)).toBe("deprecated")
    expect(stateOf(clusters, NEW_ROOT)).toBe("active")
  })
})

describe("planGardenTaxonomyNamingActivity", () => {
  const lineage = [
    {
      id: "l".repeat(24),
      organizationId,
      projectId,
      dimension: "topic" as const,
      runId,
      transitionType: "birth" as const,
      fromClusterIds: [],
      toClusterIds: [NEW_ROOT, NEW_LEAF],
      similarity: null,
      createdAt: now,
    },
  ]

  beforeEach(() => {
    redis.clear()
    calls.length = 0
    viewUpserts.length = 0
    observationReassignments.length = 0
  })

  it("plans the STAGED tree deepest-first and carries its sample member ids", async () => {
    seedRepositories(publishedTree())
    storePlan()

    const result = await planGardenTaxonomyNamingActivity({ ...stepInput, lineage, planKey } as never)

    // Staged clusters are not active yet, so the plan must come from this run's own
    // cluster ids — and the leaf carries the member ids naming samples by.
    expect(result.clusterIdsByDepth.map((entry) => entry.depth)).toEqual([1, 0])
    expect(result.clusterIdsByDepth[0]?.clusterIds).toEqual([NEW_LEAF])
    expect(result.memberObservationIdsByClusterId[NEW_LEAF]).toEqual(["obs-1", "obs-2"])
    // The retired tree is never dragged into the naming queue.
    expect(result.clusterIds).not.toContain(OLD_ROOT)
  })

  it("reads the active tree and carries no member ids without a plan key (post-publish path)", async () => {
    seedRepositories([
      cluster({ id: OLD_ROOT, parentClusterId: null, name: "Pending", state: "active" }),
      cluster({ id: OLD_LEAF, parentClusterId: OLD_ROOT, name: "Prior Leaf", state: "active" }),
    ])

    const result = await planGardenTaxonomyNamingActivity({ ...stepInput, lineage } as never)

    // A view still names after publication; that path is unchanged — active
    // clusters only, members read by `assigned_cluster_id`.
    expect(result.clusterIds).toEqual([OLD_ROOT])
    expect(result.memberObservationIdsByClusterId).toEqual({})
  })
})
