import { describe, expect, it } from "vitest"
import { TAXONOMY_DIMENSIONS } from "../constants.ts"
import { taxonomyDimensionSchema } from "./dimension.ts"
import { TaxonomyProjectionMethod, taxonomyMomentObservationSchema } from "./observation.ts"

const now = new Date("2026-01-01T00:00:00.000Z")

const baseObservation = {
  organizationId: "o".repeat(24),
  projectId: "p".repeat(24),
  observationId: "b".repeat(24),
  sessionId: "session-1",
  analysisHash: "a".repeat(64),
  momentId: "moment-1",
  projectionMethod: TaxonomyProjectionMethod.MomentTextEmbedding,
  projectionHash: "c".repeat(64),
  projectionMetadata: { turnIndexes: [0, 2] },
  embedding: [0.1, 0.2],
  assignedClusterId: null,
  assignmentConfidence: 0.7,
  assignmentMethod: "noise",
  reassignmentRunId: null,
  startTime: now,
  endTime: now,
  retentionDays: 90,
  indexedAt: now,
}

describe("taxonomy dimensions", () => {
  it("exposes the canonical taxonomy clustering dimensions", () => {
    expect(TAXONOMY_DIMENSIONS).toEqual(["topic"])
    expect(taxonomyDimensionSchema.options).toEqual(TAXONOMY_DIMENSIONS)
  })

  it("validates moment-level taxonomy observations", () => {
    const parsed = taxonomyMomentObservationSchema.parse(baseObservation)

    expect(parsed.momentId).toBe("moment-1")
    expect(parsed.analysisHash).toBe("a".repeat(64))
  })
})
