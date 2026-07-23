import {
  cuidSchema,
  customBehaviorIdSchema,
  facetIdSchema,
  organizationIdSchema,
  projectIdSchema,
  sessionIdSchema,
  taxonomyClusterIdSchema,
  taxonomyRunIdSchema,
} from "@domain/shared"
import { z } from "zod"
import { taxonomyObservationAssignmentMethodSchema } from "./observation.ts"

/**
 * One session's edge to a cluster within a single analysis view — a
 * `(scope, facet)` pair. The ClickHouse `taxonomy_view_assignments` slice holds
 * every non-online tree's memberships, so a scoped tree never mutates the global
 * `taxonomy_observations.assigned_cluster_id`.
 *
 * `customBehaviorId` names the scope (a cohort); `facetId` names the lens.
 * `facetId = null` = the topic lens, whose edges resolve against
 * `taxonomy_observations`; a set `facetId` resolves against
 * `taxonomy_facet_projections`.
 */
export const taxonomyViewAssignmentSchema = z.object({
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  customBehaviorId: customBehaviorIdSchema,
  facetId: facetIdSchema.nullable(),
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

export type TaxonomyViewAssignment = z.infer<typeof taxonomyViewAssignmentSchema>
