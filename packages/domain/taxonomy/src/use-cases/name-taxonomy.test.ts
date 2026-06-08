import { AI, type AIShape, type GenerateInput, type GenerateResult } from "@domain/ai"
import {
  ChSqlClient,
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
import { TAXONOMY_CENTROID_HALF_LIFE_SECONDS, TAXONOMY_EMBEDDING_MODEL } from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import {
  type TaxonomyMomentObservation,
  TaxonomyObservationAssignmentMethod,
  TaxonomyProjectionMethod,
} from "../entities/observation.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"
import { createFakeTaxonomyClusterRepository } from "../testing/fake-taxonomy-cluster-repository.ts"
import { createFakeTaxonomyObservationRepository } from "../testing/fake-taxonomy-observation-repository.ts"
import { nameClusterUseCase } from "./name-taxonomy.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const clusterId = TaxonomyClusterId("c".repeat(24))
const now = new Date("2026-06-04T00:00:00.000Z")

const cluster = (overrides: Partial<TaxonomyCluster> = {}): TaxonomyCluster => ({
  id: clusterId,
  organizationId,
  projectId,
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
    model: TAXONOMY_EMBEDDING_MODEL,
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
  readonly seedObservations: readonly TaxonomyMomentObservation[]
  readonly ai: AIShape
}) => {
  const clusters = createFakeTaxonomyClusterRepository([input.seedCluster ?? cluster()])
  const observations = createFakeTaxonomyObservationRepository(input.seedObservations)
  const effect = nameClusterUseCase({ organizationId, projectId, clusterId, now }).pipe(
    Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
    Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
    Effect.provide(Layer.succeed(AI, input.ai)),
    Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
    Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
    Effect.provide(Layer.succeed(DistributedLockRepository, createFakeDistributedLockRepository().repository)),
  )
  return { effect, clusters }
}

describe("nameClusterUseCase", () => {
  it("leaves clusters pending instead of naming from missing summaries", async () => {
    let generateCalls = 0
    const { effect, clusters } = runNameCluster({
      seedObservations: [observation()],
      ai: {
        generate: <T>() => {
          generateCalls++
          return Effect.die("naming should not be called without summaries") as Effect.Effect<GenerateResult<T>>
        },
        embed: () => Effect.die("embed not used"),
        rerank: () => Effect.die("rerank not used"),
      },
    })

    await expect(Effect.runPromise(effect)).resolves.toEqual({ name: "Pending", description: "" })

    expect(generateCalls).toBe(0)
    expect(clusters.clusters.get(clusterId)?.name).toBe("Pending")
  })

  it("names clusters from readable summaries without passing moment identifiers to the model", async () => {
    const prompts: string[] = []
    const momentId = "f".repeat(64)
    const summary = "Agent behavior: Assistant: The agent reset roaming settings and explained the next step."
    const { effect, clusters } = runNameCluster({
      seedObservations: [observation({ momentId, projectionMetadata: { summary } })],
      ai: {
        generate: <T>(input: GenerateInput<T>) => {
          prompts.push(input.prompt)
          const object = input.prompt.includes("Candidates:")
            ? {
                name: "Roaming Troubleshooting",
                description: "Agent resets roaming settings and explains follow-up steps.",
              }
            : { candidates: [{ theme: "roaming troubleshooting", examples: [0] }] }
          return Effect.succeed({ object: object as T, tokens: 10, duration: 1 } satisfies GenerateResult<T>)
        },
        embed: () => Effect.die("embed not used"),
        rerank: () => Effect.die("rerank not used"),
      },
    })

    await expect(Effect.runPromise(effect)).resolves.toEqual({
      name: "Roaming Troubleshooting",
      description: "Agent resets roaming settings and explains follow-up steps.",
    })

    expect(prompts.join("\n")).toContain(summary)
    expect(prompts.join("\n")).not.toContain(momentId)
    expect(clusters.clusters.get(clusterId)?.name).toBe("Roaming Troubleshooting")
  })
})
