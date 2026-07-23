import { DEFAULT_EMBEDDING_CONFIG, type GenerateInput, type GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import {
  ChSqlClient,
  CustomBehaviorId,
  DistributedLockRepository,
  OrganizationId,
  ProjectId,
  SessionId,
  SqlClient,
  TaxonomyClusterId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeDistributedLockRepository, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { TAXONOMY_CENTROID_HALF_LIFE_SECONDS } from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import {
  type TaxonomyMomentObservation,
  TaxonomyObservationAssignmentMethod,
  TaxonomyProjectionMethod,
} from "../entities/observation.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyViewAssignmentRepository } from "../ports/taxonomy-view-assignment-repository.ts"
import { createFakeTaxonomyClusterRepository } from "../testing/fake-taxonomy-cluster-repository.ts"
import { createFakeTaxonomyViewAssignmentRepository } from "../testing/fake-taxonomy-view-assignment-repository.ts"
import { nameCustomBehaviorClusterUseCase } from "./name-custom-behavior-cluster.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const customBehaviorId = CustomBehaviorId("b".repeat(24))
const clusterId = TaxonomyClusterId("c".repeat(24))
const now = new Date("2026-06-04T00:00:00.000Z")

const cluster = (overrides: Partial<TaxonomyCluster> = {}): TaxonomyCluster => ({
  id: clusterId,
  organizationId,
  projectId,
  customBehaviorId,
  facetId: null,
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

const observation = (overrides: Partial<TaxonomyMomentObservation> = {}): TaxonomyMomentObservation => ({
  organizationId,
  projectId,
  observationId: "o".repeat(24),
  sessionId: SessionId("session-1"),
  analysisHash: "a".repeat(64),
  momentId: "f".repeat(64),
  projectionMethod: TaxonomyProjectionMethod.MomentTextEmbedding,
  projectionHash: "b".repeat(64),
  projectionMetadata: {},
  embedding: [1, 0],
  assignedClusterId: clusterId,
  assignmentConfidence: 1,
  assignmentMethod: TaxonomyObservationAssignmentMethod.GardeningBirth,
  reassignmentRunId: null,
  startTime: now,
  endTime: now,
  retentionDays: 30,
  indexedAt: now,
  ...overrides,
})

const runNameCluster = (input: {
  readonly seedCluster?: TaxonomyCluster
  readonly members: readonly TaxonomyMomentObservation[]
  readonly generate: <T>(input: GenerateInput<T>) => Effect.Effect<GenerateResult<T>>
}) => {
  const clusters = createFakeTaxonomyClusterRepository([input.seedCluster ?? cluster()])
  const assignments = createFakeTaxonomyViewAssignmentRepository({ [clusterId]: input.members })
  const ai = createFakeAI({ generate: input.generate })
  const effect = nameCustomBehaviorClusterUseCase({ organizationId, projectId, customBehaviorId, clusterId, now }).pipe(
    Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
    Effect.provide(Layer.succeed(TaxonomyViewAssignmentRepository, assignments.repository)),
    Effect.provide(ai.layer),
    Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
    Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
    Effect.provide(Layer.succeed(DistributedLockRepository, createFakeDistributedLockRepository().repository)),
  )
  return { effect, clusters, ai }
}

describe("nameCustomBehaviorClusterUseCase", () => {
  it("leaves the scoped cluster pending when its members have no readable summaries", async () => {
    const { effect, clusters, ai } = runNameCluster({
      members: [observation()],
      generate: <T>() =>
        Effect.die("naming should not be called without summaries") as Effect.Effect<GenerateResult<T>>,
    })

    await expect(Effect.runPromise(effect)).resolves.toEqual({ name: "Pending", description: "" })

    expect(ai.calls.generate).toHaveLength(0)
    expect(clusters.clusters.get(clusterId)?.name).toBe("Pending")
  })

  it("names the scoped cluster from its behavior-slice member summaries", async () => {
    const momentId = "f".repeat(64)
    const summary = "Agent behavior: Assistant: The agent reset roaming settings and explained the next step."
    const { effect, clusters, ai } = runNameCluster({
      members: [observation({ momentId, projectionMetadata: { summary } })],
      generate: <T>(input: GenerateInput<T>) => {
        const object = input.prompt.includes("Candidates:")
          ? {
              name: "Roaming Troubleshooting",
              description: "Agent resets roaming settings and explains follow-up steps.",
            }
          : { candidates: [{ theme: "roaming troubleshooting", examples: [0] }] }
        return Effect.succeed({ object: object as T, tokens: 10, duration: 1 } satisfies GenerateResult<T>)
      },
    })

    await expect(Effect.runPromise(effect)).resolves.toEqual({
      name: "Roaming Troubleshooting",
      description: "Agent resets roaming settings and explains follow-up steps.",
    })

    const prompts = ai.calls.generate.map((call) => call.prompt).join("\n")
    expect(prompts).toContain(summary)
    expect(prompts).not.toContain(momentId)
    const saved = clusters.clusters.get(clusterId)
    expect(saved?.name).toBe("Roaming Troubleshooting")
    // The naming step must not leak the write out of the behavior scope.
    expect(saved?.customBehaviorId).toBe(customBehaviorId)
  })
})
