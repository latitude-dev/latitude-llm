import {
  AI,
  type AIShape,
  EMBEDDING_DIMENSIONS,
  type EmbedResult,
  type GenerateInput,
  type GenerateResult,
} from "@domain/ai"
import {
  ChSqlClient,
  CustomBehaviorId,
  FacetId,
  OrganizationId,
  ProjectId,
  SessionId,
  SqlClient,
  TaxonomyRunId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { TaxonomyFacet } from "../entities/facet.ts"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import { FacetProjectionRepository } from "../ports/facet-projection-repository.ts"
import { FacetRepository } from "../ports/facet-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"
import { createFakeFacetProjectionRepository } from "../testing/fake-facet-projection-repository.ts"
import { createFakeFacetRepository } from "../testing/fake-facet-repository.ts"
import { createFakeTaxonomyClusterRepository } from "../testing/fake-taxonomy-cluster-repository.ts"
import { createFakeTaxonomyObservationRepository } from "../testing/fake-taxonomy-observation-repository.ts"
import { planFacetGardenUseCase } from "./plan-facet-garden.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const facetId = FacetId("f".repeat(24))
const customBehaviorId = CustomBehaviorId("b".repeat(24))
const runId = TaxonomyRunId("r".repeat(24))
const now = new Date("2026-06-04T00:00:00.000Z")
const since = new Date("2026-06-01T00:00:00.000Z")

const UNCLEAR_MARKER = "NO-CLEAR-GOAL"

// A full-width unit embedding — clustering builds centroids, which require the
// configured embedding dimensionality.
const facetEmbedding = (): number[] => {
  const vec = new Array(EMBEDDING_DIMENSIONS).fill(0)
  vec[0] = 1
  return vec
}

const facet: TaxonomyFacet = {
  id: facetId,
  organizationId,
  projectId,
  slug: "apparent-user-goal",
  name: "Apparent user goal",
  description: "What the user is trying to accomplish.",
  instructions: "In one sentence, what was the user ultimately trying to accomplish?",
  createdAt: now,
  updatedAt: now,
}

// Each session's stored transcript summary is what listForFacetSample projects;
// `unclear` sessions carry the marker so the fake AI reports them as unclear.
const makeObservation = (index: number, unclear: boolean): TaxonomyMomentObservation => ({
  organizationId,
  projectId,
  observationId: String(index).padStart(24, "0"),
  sessionId: SessionId(`session-${index}`),
  analysisHash: "a".repeat(64),
  momentId: `moment-${index}`,
  projectionMethod: "moment_text_embedding",
  projectionHash: "b".repeat(64),
  projectionMetadata: { summary: unclear ? UNCLEAR_MARKER : `User: help with task ${index}.` },
  embedding: [1, 0],
  assignedClusterId: null,
  assignmentConfidence: 0,
  assignmentMethod: "noise",
  reassignmentRunId: null,
  startTime: new Date(since.getTime() + index * 60_000),
  endTime: new Date(since.getTime() + index * 60_000 + 1_000),
  retentionDays: 90,
  indexedAt: since,
})

const makeAi = (): AIShape => ({
  generate: <T>(input: GenerateInput<T>) => {
    const unclear = input.prompt.includes(UNCLEAR_MARKER)
    const object = { unclear, answer: unclear ? "" : "The user wants to finish a task." }
    return Effect.succeed({ object: object as T, tokens: 10, duration: 1 } satisfies GenerateResult<T>)
  },
  embed: () => Effect.succeed({ embedding: facetEmbedding() } satisfies EmbedResult),
  rerank: () => Effect.die("rerank not used"),
})

const run = (
  input: Parameters<typeof planFacetGardenUseCase>[0],
  observations: readonly TaxonomyMomentObservation[],
) => {
  const facets = createFakeFacetRepository([facet])
  const obsRepo = createFakeTaxonomyObservationRepository(observations)
  const projections = createFakeFacetProjectionRepository([])
  const clusters = createFakeTaxonomyClusterRepository([])
  return Effect.runPromise(
    planFacetGardenUseCase(input).pipe(
      Effect.provide(Layer.succeed(FacetRepository, facets.repository)),
      Effect.provide(Layer.succeed(TaxonomyObservationRepository, obsRepo.repository)),
      Effect.provide(Layer.succeed(FacetProjectionRepository, projections.repository)),
      Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
      Effect.provide(Layer.succeed(AI, makeAi())),
      Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
      Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
    ),
  )
}

const baseInput = { organizationId, projectId, runId, dimension: "topic" as const, facetId, customBehaviorId, now }

describe("planFacetGardenUseCase", () => {
  it("samples, extracts, and clusters a facet view; keys clusters + edges by (behavior, facet)", async () => {
    const observations = Array.from({ length: 20 }, (_, index) => makeObservation(index, false))
    const plan = await run({ ...baseInput, filterSet: { userId: [{ op: "in", value: ["u"] }] } }, observations)

    expect(plan.facetId).toBe(facetId)
    expect(plan.customBehaviorId).toBe(customBehaviorId)
    expect(plan.clustersBorn).toBeGreaterThanOrEqual(1)
    // All 20 clear projections were clustered (none dropped).
    expect(plan.observationsSampled).toBe(20)
    // Facet edges go to the view slice, never the inline global column.
    expect(plan.observationAssignments).toEqual([])
    expect(plan.customAssignments.length).toBeGreaterThan(0)
    expect(plan.customAssignments.every((a) => a.customBehaviorId === customBehaviorId && a.facetId === facetId)).toBe(
      true,
    )
    // sessionId is threaded from the extracted projections.
    expect(plan.customAssignments.every((a) => (a.sessionId as string).startsWith("session-"))).toBe(true)
    expect(plan.clusters.every((c) => c.customBehaviorId === customBehaviorId && c.facetId === facetId)).toBe(true)
  })

  it("excludes unclear projections from clustering", async () => {
    // 20 clear (≥ the gardening minimum) + 5 unclear; only the clear ones cluster.
    const observations = [
      ...Array.from({ length: 20 }, (_, index) => makeObservation(index, false)),
      ...Array.from({ length: 5 }, (_, index) => makeObservation(100 + index, true)),
    ]
    const plan = await run(baseInput, observations)

    // Only the 20 clear projections reach clustering; the 5 unclear are dropped.
    expect(plan.observationsSampled).toBe(20)
    const unclearSessionIds = new Set(Array.from({ length: 5 }, (_, index) => `session-${100 + index}`))
    expect(plan.customAssignments.some((a) => unclearSessionIds.has(a.sessionId as string))).toBe(false)
  })

  it("compiles the facet's instructions into the extraction prompt", async () => {
    const systemPrompts: string[] = []
    const facets = createFakeFacetRepository([facet])
    const obsRepo = createFakeTaxonomyObservationRepository([makeObservation(0, false)])
    const projections = createFakeFacetProjectionRepository([])
    const clusters = createFakeTaxonomyClusterRepository([])
    const spyingAi: AIShape = {
      generate: <T>(input: GenerateInput<T>) => {
        systemPrompts.push(input.system)
        return Effect.succeed({
          object: { unclear: false, answer: "goal" } as T,
          tokens: 1,
          duration: 1,
        } satisfies GenerateResult<T>)
      },
      embed: () => Effect.succeed({ embedding: facetEmbedding() } satisfies EmbedResult),
      rerank: () => Effect.die("rerank not used"),
    }

    await Effect.runPromise(
      planFacetGardenUseCase(baseInput).pipe(
        Effect.provide(Layer.succeed(FacetRepository, facets.repository)),
        Effect.provide(Layer.succeed(TaxonomyObservationRepository, obsRepo.repository)),
        Effect.provide(Layer.succeed(FacetProjectionRepository, projections.repository)),
        Effect.provide(Layer.succeed(TaxonomyClusterRepository, clusters.repository)),
        Effect.provide(Layer.succeed(AI, spyingAi)),
        Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
        Effect.provide(Layer.succeed(SqlClient, createFakeSqlClient())),
      ),
    )

    expect(systemPrompts.some((prompt) => prompt.includes(facet.instructions))).toBe(true)
  })
})
