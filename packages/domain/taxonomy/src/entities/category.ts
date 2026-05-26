import { cuidSchema, taxonomyCategoryIdSchema } from "@domain/shared"
import { z } from "zod"
import {
  TAXONOMY_CATEGORY_STATES,
  TAXONOMY_CLUSTER_DESCRIPTION_MAX_LENGTH,
  TAXONOMY_CLUSTER_NAME_MAX_LENGTH,
} from "../constants.ts"

export const taxonomyCategoryStateSchema = z.enum(TAXONOMY_CATEGORY_STATES)
export type TaxonomyCategoryState = z.infer<typeof taxonomyCategoryStateSchema>

export const TaxonomyCategoryState = {
  Active: "active",
  Deprecated: "deprecated",
} as const satisfies Record<string, TaxonomyCategoryState>

export const taxonomyCategorySchema = z.object({
  id: taxonomyCategoryIdSchema,
  organizationId: cuidSchema,
  projectId: cuidSchema,
  name: z.string().min(1).max(TAXONOMY_CLUSTER_NAME_MAX_LENGTH),
  description: z.string().max(TAXONOMY_CLUSTER_DESCRIPTION_MAX_LENGTH),
  /** Normalized mean of member cluster centroids; empty when no active members. */
  centroidEmbedding: z.array(z.number()),
  clusterCount: z.number().int().nonnegative(),
  observationCount: z.number().int().nonnegative(),
  state: taxonomyCategoryStateSchema,
  clusteredAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type TaxonomyCategory = z.infer<typeof taxonomyCategorySchema>
