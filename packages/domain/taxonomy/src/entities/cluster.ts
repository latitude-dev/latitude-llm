import { cuidSchema, taxonomyClusterIdSchema } from "@domain/shared"
import { z } from "zod"
import {
  TAXONOMY_CLUSTER_DESCRIPTION_MAX_LENGTH,
  TAXONOMY_CLUSTER_NAME_MAX_LENGTH,
  TAXONOMY_CLUSTER_STATES,
} from "../constants.ts"
import { taxonomyDimensionSchema } from "./dimension.ts"

// ---------------------------------------------------------------------------
// TaxonomyClusterState
// ---------------------------------------------------------------------------

export const taxonomyClusterStateSchema = z.enum(TAXONOMY_CLUSTER_STATES)
export type TaxonomyClusterState = z.infer<typeof taxonomyClusterStateSchema>

export const TaxonomyClusterState = {
  Active: "active",
  Merged: "merged",
  Deprecated: "deprecated",
} as const satisfies Record<string, TaxonomyClusterState>

// ---------------------------------------------------------------------------
// TaxonomyCentroid
// ---------------------------------------------------------------------------

/**
 * Single weight bucket in MVP — multi-source weighting is Future Work.
 * Shape matches `Centroid<{ default: number }>` from `@domain/shared/centroid`.
 */
export const taxonomyCentroidSchema = z.object({
  base: z.array(z.number()), // running weighted-decayed sum of normalized observation embeddings
  mass: z.number(), // running scalar mass
  model: z.string(), // embedding model used to compute the centroid
  decay: z.number().positive(), // half-life in seconds
  weights: z.object({ default: z.number().nonnegative() }),
})

export type TaxonomyCentroid = z.infer<typeof taxonomyCentroidSchema>

// ---------------------------------------------------------------------------
// TaxonomyCluster
// ---------------------------------------------------------------------------

export const taxonomyClusterSchema = z.object({
  id: taxonomyClusterIdSchema,
  organizationId: cuidSchema,
  projectId: cuidSchema,
  dimension: taxonomyDimensionSchema,
  /** Tree parent. Null = root node (the coarsest density level). */
  parentClusterId: taxonomyClusterIdSchema.nullable(),
  /** 0 = root; each level clusters at a tighter density than its parent. */
  depth: z.number().int().nonnegative(),
  /** Ancestor id chain like "rootId/parentId/" (empty for roots). Subtree
   * queries are a prefix match and a node may never appear in its own path. */
  path: z.string(),
  /**
   * The link density this node's children were split at; null until the node
   * recurses. Child-level merge floors and descent gates read it so every
   * decision at that level uses the density that created it.
   */
  splitLinkThreshold: z.number().min(0).max(1).nullable(),
  name: z.string().min(1).max(TAXONOMY_CLUSTER_NAME_MAX_LENGTH),
  description: z.string().max(TAXONOMY_CLUSTER_DESCRIPTION_MAX_LENGTH), // empty allowed for "Pending" naming
  centroid: taxonomyCentroidSchema,
  observationCount: z.number().int().nonnegative(),
  state: taxonomyClusterStateSchema,
  mergedIntoClusterId: taxonomyClusterIdSchema.nullable(),
  firstObservedAt: z.date(),
  lastObservedAt: z.date(),
  clusteredAt: z.date(), // decay anchor; NOT updatedAt
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type TaxonomyCluster = z.infer<typeof taxonomyClusterSchema>
