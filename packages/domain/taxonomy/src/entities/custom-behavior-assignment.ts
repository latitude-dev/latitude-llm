import {
  cuidSchema,
  customBehaviorIdSchema,
  organizationIdSchema,
  projectIdSchema,
  sessionIdSchema,
  taxonomyClusterIdSchema,
  taxonomyRunIdSchema,
} from "@domain/shared"
import { z } from "zod"
import { taxonomyObservationAssignmentMethodSchema } from "./observation.ts"

/**
 * One observation's assignment to a scoped cluster within a custom behavior.
 *
 * The ClickHouse `custom_behavior_assignments` slice mirrors the
 * `taxonomy_observations` layout but is keyed by `custom_behavior_id`, so a
 * behavior's scoped tree never mutates the global
 * `taxonomy_observations.assigned_cluster_id`. Phase 2 writes it; Phase 3 reads
 * it.
 */
export const customBehaviorAssignmentSchema = z.object({
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  customBehaviorId: customBehaviorIdSchema,
  observationId: cuidSchema,
  sessionId: sessionIdSchema,
  assignedClusterId: taxonomyClusterIdSchema.nullable(),
  assignmentConfidence: z.number().min(0).max(1),
  assignmentMethod: taxonomyObservationAssignmentMethodSchema,
  reassignmentRunId: taxonomyRunIdSchema.nullable(),
  startTime: z.date(),
  retentionDays: z.number().int().positive(),
  indexedAt: z.date(),
})

export type CustomBehaviorAssignment = z.infer<typeof customBehaviorAssignmentSchema>
