import { DEFAULT_EMBEDDING_CONFIG } from "@domain/ai"
import { CustomBehaviorId, type OrganizationId, ProjectId, SqlClient, type TaxonomyClusterId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { TAXONOMY_CENTROID_HALF_LIFE_SECONDS } from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { createFakeTaxonomyClusterRepository } from "../testing/fake-taxonomy-cluster-repository.ts"
import { deprecateCustomBehaviorTreeUseCase } from "./deprecate-custom-behavior-tree.ts"

const organizationId = "o".repeat(24) as OrganizationId
const projectId = ProjectId("p".repeat(24))
const customBehaviorId = CustomBehaviorId("b".repeat(24))
const now = new Date("2026-06-04T00:00:00.000Z")

const cluster = (id: string, overrides: Partial<TaxonomyCluster> = {}): TaxonomyCluster => ({
  id: id as TaxonomyClusterId,
  organizationId,
  projectId,
  customBehaviorId: null,
  dimension: "topic",
  parentClusterId: null,
  depth: 0,
  path: "",
  splitLinkThreshold: null,
  name: "Pending",
  description: "",
  centroid: {
    base: [1, 0],
    mass: 1,
    model: DEFAULT_EMBEDDING_CONFIG.model,
    decay: TAXONOMY_CENTROID_HALF_LIFE_SECONDS,
    weights: { default: 1 },
  },
  observationCount: 1,
  state: "active",
  mergedIntoClusterId: null,
  firstObservedAt: now,
  lastObservedAt: now,
  clusteredAt: now,
  createdAt: now,
  updatedAt: now,
  ...overrides,
})

const run = (clusters: ReturnType<typeof createFakeTaxonomyClusterRepository>) =>
  Effect.runPromise(
    deprecateCustomBehaviorTreeUseCase({ projectId, customBehaviorId, dimension: "topic", now }).pipe(
      Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
      Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
    ),
  )

describe("deprecateCustomBehaviorTreeUseCase", () => {
  it("deprecates only the behavior's active scoped clusters, never the global tree or other behaviors", async () => {
    const otherBehaviorId = CustomBehaviorId("z".repeat(24))
    const clusters = createFakeTaxonomyClusterRepository([
      cluster("a".repeat(24), { customBehaviorId }),
      cluster("c".repeat(24), { customBehaviorId, parentClusterId: "a".repeat(24) as TaxonomyClusterId, depth: 1 }),
      cluster("g".repeat(24), { customBehaviorId: null }),
      cluster("d".repeat(24), { customBehaviorId: otherBehaviorId }),
    ])

    const result = await run(clusters)

    expect(result.clustersDeprecated).toBe(2)
    expect(clusters.clusters.get("a".repeat(24) as TaxonomyClusterId)?.state).toBe("deprecated")
    expect(clusters.clusters.get("c".repeat(24) as TaxonomyClusterId)?.state).toBe("deprecated")
    // Global tree and another behavior's scope stay active.
    expect(clusters.clusters.get("g".repeat(24) as TaxonomyClusterId)?.state).toBe("active")
    expect(clusters.clusters.get("d".repeat(24) as TaxonomyClusterId)?.state).toBe("active")
  })

  it("is a no-op when the behavior has no active scoped clusters", async () => {
    const clusters = createFakeTaxonomyClusterRepository([
      cluster("g".repeat(24), { customBehaviorId: null }),
      cluster("a".repeat(24), { customBehaviorId, state: "deprecated" }),
    ])

    const result = await run(clusters)

    expect(result.clustersDeprecated).toBe(0)
    expect(clusters.clusters.get("g".repeat(24) as TaxonomyClusterId)?.state).toBe("active")
  })
})
