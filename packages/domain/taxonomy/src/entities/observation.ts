import { cuidSchema, sessionIdSchema, taxonomyClusterIdSchema, taxonomyRunIdSchema } from "@domain/shared"
import { z } from "zod"
import { TAXONOMY_OBSERVATION_ASSIGNMENT_METHODS, TAXONOMY_PROJECTION_METHODS } from "../constants.ts"

export const taxonomyObservationAssignmentMethodSchema = z.enum(TAXONOMY_OBSERVATION_ASSIGNMENT_METHODS)
export type TaxonomyObservationAssignmentMethod = z.infer<typeof taxonomyObservationAssignmentMethodSchema>

export const taxonomyProjectionMethodSchema = z.enum(TAXONOMY_PROJECTION_METHODS)
export type TaxonomyProjectionMethod = z.infer<typeof taxonomyProjectionMethodSchema>

export const TaxonomyProjectionMethod = {
  MomentTextEmbedding: "moment_text_embedding",
  SessionUserIntentEmbedding: "session_user_intent_embedding",
} as const satisfies Record<string, TaxonomyProjectionMethod>

export const TaxonomyObservationAssignmentMethod = {
  CentroidOnline: "centroid_online",
  GardeningBirth: "gardening_birth",
  GardeningReassign: "gardening_reassign",
  Noise: "noise",
} as const satisfies Record<string, TaxonomyObservationAssignmentMethod>

/**
 * Canonical taxonomy observation for topic clustering.
 *
 * The current topic projection is one session-level conversation embedding per
 * analyzed session. Semantic moments and moment labels remain the source of
 * truth for behavioural/process facets.
 */
export const taxonomyMomentObservationSchema = z.object({
  organizationId: cuidSchema,
  projectId: cuidSchema,
  observationId: cuidSchema,
  sessionId: sessionIdSchema,
  analysisHash: z.string().length(64),
  momentId: z.string().min(1),
  projectionMethod: taxonomyProjectionMethodSchema,
  projectionHash: z.string().length(64),
  projectionMetadata: z.record(z.string(), z.unknown()),
  embedding: z.array(z.number()),
  assignedClusterId: taxonomyClusterIdSchema.nullable(),
  assignmentConfidence: z.number().min(0).max(1),
  assignmentMethod: taxonomyObservationAssignmentMethodSchema,
  reassignmentRunId: taxonomyRunIdSchema.nullable(),
  startTime: z.date(),
  endTime: z.date(),
  retentionDays: z.number().int().positive(),
  indexedAt: z.date(),
})

export type TaxonomyMomentObservation = z.infer<typeof taxonomyMomentObservationSchema>
