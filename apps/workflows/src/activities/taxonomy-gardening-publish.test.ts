import type { TaxonomyClusterId } from "@domain/shared"
import { type TaxonomyCluster, taxonomyClusterSchema } from "@domain/taxonomy"
import { createFakeTaxonomyClusterRepository, createFakeTaxonomyObservationRepository } from "@domain/taxonomy/testing"
import { silenceLoggerInTests } from "@repo/vitest-config/silence-logger"
import { Effect } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"

// These activities own the publish ORDER (reassign, then swap) and the id sets
// the swap acts on, which is exactly what the blank-Behaviours fix changed. They
// reach Postgres/ClickHouse/Redis through module singletons, so the seams are
// mocked the same way `evaluation-alignment-activities.test.ts` does it: real
// domain fakes behind mocked `withPostgres` / `withClickHouse`, and an in-memory
// stand-in for the Redis plan artifact.
const { fakes, redis, calls } = vi.hoisted(() => ({
  fakes: { clusters: null as unknown, observations: null as unknown },
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
          E.provide(L.succeed(domain.TaxonomyViewAssignmentRepository, {} as never)),
          E.provide(L.succeed(shared.ChSqlClient, testing.createFakeChSqlClient())),
        ),
  }
})

import {
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
  readonly supersededClusterIds: readonly string[]
  readonly stagedClusterIds?: readonly string[] | undefined
  readonly namingMembers?:
    | readonly { readonly clusterId: string; readonly observationIds: readonly string[] }[]
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
    supersededClusterIds: [],
    stagedClusterIds: [NEW_ROOT, NEW_LEAF],
    namingMembers: [{ clusterId: NEW_LEAF, observationIds: ["obs-1", "obs-2"] }],
    ...overrides,
  }
  redis.set(planKey, JSON.stringify(plan))
  return plan
}

const seedRepositories = (seed: readonly TaxonomyCluster[]) => {
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
  const observations = createFakeTaxonomyObservationRepository([], {
    reassignManyById: () => {
      calls.push("reassign")
      return Effect.void
    },
  })
  fakes.clusters = clusters.repository
  fakes.observations = observations.repository
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
    })
    await deprecateGardenTaxonomyClustersActivity({ ...stepInput, planKey })

    expect(stateOf(adaptiveClusters, OLD_ROOT)).toBe("deprecated")
    expect(stateOf(adaptiveClusters, OLD_LEAF)).toBe("deprecated")
    expect(stateOf(adaptiveClusters, NEW_ROOT)).toBe("active")
  })

  it("falls back to the plan's whole cluster set on a pre-change adaptive plan", async () => {
    const clusters = seedRepositories(publishedTree())
    storePlan({
      mode: "enforced",
      supersededClusterIds: [OLD_ROOT, OLD_LEAF],
      leafClusters: [{ clusterId: NEW_LEAF, centroid: [1, 0] }],
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
