import { cuidSchema, taxonomyClusterIdSchema, taxonomyLineageIdSchema, taxonomyRunIdSchema } from "@domain/shared"
import { z } from "zod"
import { TAXONOMY_LINEAGE_TRANSITION_TYPES, TAXONOMY_RUN_STATUSES, TAXONOMY_RUN_TRIGGERS } from "../constants.ts"

export const taxonomyLineageTransitionTypeSchema = z.enum(TAXONOMY_LINEAGE_TRANSITION_TYPES)
export type TaxonomyLineageTransitionType = z.infer<typeof taxonomyLineageTransitionTypeSchema>

export const TaxonomyLineageTransitionType = {
  Birth: "birth",
  Death: "death",
  Merge: "merge",
  Continuation: "continuation",
  Split: "split",
} as const satisfies Record<string, TaxonomyLineageTransitionType>

export const taxonomyClusterLineageSchema = z.object({
  id: taxonomyLineageIdSchema,
  organizationId: cuidSchema,
  projectId: cuidSchema,
  runId: taxonomyRunIdSchema,
  transitionType: taxonomyLineageTransitionTypeSchema,
  fromClusterIds: z.array(taxonomyClusterIdSchema),
  toClusterIds: z.array(taxonomyClusterIdSchema),
  similarity: z.number().nullable(),
  createdAt: z.date(),
})

export type TaxonomyClusterLineage = z.infer<typeof taxonomyClusterLineageSchema>

// ---------------------------------------------------------------------------
// TaxonomyRun
// ---------------------------------------------------------------------------

export const taxonomyRunTriggerSchema = z.enum(TAXONOMY_RUN_TRIGGERS)
export type TaxonomyRunTrigger = z.infer<typeof taxonomyRunTriggerSchema>

export const taxonomyRunStatusSchema = z.enum(TAXONOMY_RUN_STATUSES)
export type TaxonomyRunStatus = z.infer<typeof taxonomyRunStatusSchema>

export const TaxonomyRunStatus = {
  Pending: "pending",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
} as const satisfies Record<string, TaxonomyRunStatus>

export const taxonomyRunSchema = z.object({
  id: taxonomyRunIdSchema,
  organizationId: cuidSchema,
  projectId: cuidSchema,
  trigger: taxonomyRunTriggerSchema,
  status: taxonomyRunStatusSchema,
  startedAt: z.date(),
  completedAt: z.date().nullable(),
  observationsScanned: z.number().int().nonnegative(),
  noiseScanned: z.number().int().nonnegative(),
  clustersBorn: z.number().int().nonnegative(),
  clustersMerged: z.number().int().nonnegative(),
  clustersDeprecated: z.number().int().nonnegative(),
  categoriesRebuilt: z.number().int().nonnegative(),
  error: z.string().nullable(),
})

export type TaxonomyRun = z.infer<typeof taxonomyRunSchema>
