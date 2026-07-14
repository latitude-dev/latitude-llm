import { ChSqlClient, type FilterSet, OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { CUSTOM_BEHAVIOR_LOOKBACK_DAYS, TAXONOMY_GARDENING_MIN_OBSERVATIONS } from "../constants.ts"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import { CustomBehaviorFilterInvalidError } from "../errors.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"
import { createFakeTaxonomyObservationRepository } from "../testing/fake-taxonomy-observation-repository.ts"
import { previewCustomBehaviorSampleUseCase } from "./preview-custom-behavior-sample.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const now = new Date("2026-07-14T00:00:00.000Z")
const FILTER: FilterSet = { moments: [{ op: "in", value: ["escalation"] }] }
const DAY_MS = 24 * 60 * 60 * 1000

const makeObservation = (index: number, startTime: Date): TaxonomyMomentObservation => ({
  organizationId,
  projectId,
  observationId: String(index).padStart(24, "o").slice(0, 24),
  sessionId: SessionId(`session-${index}`),
  analysisHash: String(index).repeat(64).slice(0, 64),
  momentId: `moment-${index}`,
  projectionMethod: "moment_text_embedding",
  projectionHash: String(index).repeat(64).slice(0, 64),
  projectionMetadata: { summary: `Observation ${index}` },
  embedding: [0.1, 0.2, 0.3],
  startTime,
  endTime: new Date(startTime.getTime() + 500),
  assignedClusterId: null,
  assignmentConfidence: 0,
  assignmentMethod: "noise",
  reassignmentRunId: null,
  retentionDays: 30,
  indexedAt: now,
})

const run = (input: { readonly filterSet: FilterSet }, seed: readonly TaxonomyMomentObservation[]) => {
  const observations = createFakeTaxonomyObservationRepository(seed)
  return Effect.runPromise(
    previewCustomBehaviorSampleUseCase({ organizationId, projectId, filterSet: input.filterSet, now }).pipe(
      Effect.provide(Layer.succeed(TaxonomyObservationRepository, observations.repository)),
      Effect.provide(Layer.succeed(ChSqlClient, createFakeChSqlClient())),
    ),
  )
}

describe("previewCustomBehaviorSampleUseCase", () => {
  it("returns eligible counts and is ready at the minimum-observation threshold", async () => {
    const seed = Array.from({ length: TAXONOMY_GARDENING_MIN_OBSERVATIONS }, (_, i) => makeObservation(i, now))
    const result = await run({ filterSet: FILTER }, seed)
    expect(result.observationCount).toBe(TAXONOMY_GARDENING_MIN_OBSERVATIONS)
    expect(result.sessionCount).toBe(TAXONOMY_GARDENING_MIN_OBSERVATIONS)
    expect(result.minObservations).toBe(TAXONOMY_GARDENING_MIN_OBSERVATIONS)
    expect(result.isReady).toBe(true)
  })

  it("is not ready one observation below the threshold", async () => {
    const seed = Array.from({ length: TAXONOMY_GARDENING_MIN_OBSERVATIONS - 1 }, (_, i) => makeObservation(i, now))
    const result = await run({ filterSet: FILTER }, seed)
    expect(result.observationCount).toBe(TAXONOMY_GARDENING_MIN_OBSERVATIONS - 1)
    expect(result.isReady).toBe(false)
  })

  it("counts only observations inside the lookback window (since = now - CUSTOM_BEHAVIOR_LOOKBACK_DAYS)", async () => {
    const inWindow = Array.from({ length: 3 }, (_, i) => makeObservation(i, now))
    const outsideWindow = Array.from({ length: 5 }, (_, i) =>
      makeObservation(100 + i, new Date(now.getTime() - (CUSTOM_BEHAVIOR_LOOKBACK_DAYS + 1) * DAY_MS)),
    )
    const result = await run({ filterSet: FILTER }, [...inWindow, ...outsideWindow])
    expect(result.observationCount).toBe(3)
  })

  it("rejects a filter set containing topics", async () => {
    await expect(run({ filterSet: { topics: [{ op: "in", value: ["support"] }] } }, [])).rejects.toBeInstanceOf(
      CustomBehaviorFilterInvalidError,
    )
  })
})
