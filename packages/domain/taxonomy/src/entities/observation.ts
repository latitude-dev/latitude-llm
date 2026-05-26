import {
  cuidSchema,
  sessionIdSchema,
  taxonomyClusterIdSchema,
  taxonomyRunIdSchema,
  traceIdSchema,
} from "@domain/shared"
import { z } from "zod"
import { TAXONOMY_OBSERVATION_ASSIGNMENT_METHODS } from "../constants.ts"

export const taxonomyObservationAssignmentMethodSchema = z.enum(TAXONOMY_OBSERVATION_ASSIGNMENT_METHODS)
export type TaxonomyObservationAssignmentMethod = z.infer<typeof taxonomyObservationAssignmentMethodSchema>

export const TaxonomyObservationAssignmentMethod = {
  CentroidOnline: "centroid_online",
  GardeningBirth: "gardening_birth",
  GardeningReassign: "gardening_reassign",
  Noise: "noise",
} as const satisfies Record<string, TaxonomyObservationAssignmentMethod>

/**
 * One observation per (organizationId, projectId, sessionId). Stored
 * append-only in ClickHouse `behavior_observations`; later versions of the
 * same row (e.g. from a gardening reassignment) collapse via
 * `ReplacingMergeTree(indexed_at)`.
 */
export const taxonomyObservationSchema = z.object({
  organizationId: cuidSchema,
  projectId: cuidSchema,
  sessionId: sessionIdSchema,
  startTime: z.date(),
  endTime: z.date(),
  traceIds: z.array(traceIdSchema),
  summary: z.string(),
  /** SHA-256 hex of the canonical session document; used for summary/embedding caching. */
  summaryHash: z.string().length(64),
  embedding: z.array(z.number()), // may be empty for sessions below TAXONOMY_SESSION_MIN_LENGTH
  embeddingModel: z.string(),
  /** Null when the row is in the noise bucket. CH storage maps this to `''`. */
  assignedClusterId: taxonomyClusterIdSchema.nullable(),
  assignmentConfidence: z.number(),
  assignmentMethod: taxonomyObservationAssignmentMethodSchema,
  /** Null when the row has never been reassigned. CH storage maps this to `''`. */
  reassignmentRunId: taxonomyRunIdSchema.nullable(),
  retentionDays: z.number().int().positive(),
  indexedAt: z.date(),
})

export type TaxonomyObservation = z.infer<typeof taxonomyObservationSchema>
