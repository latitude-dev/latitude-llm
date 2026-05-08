import {
  datasetIdSchema,
  datasetVersionIdSchema,
  organizationIdSchema,
  projectIdSchema,
  SLUG_MAX_LENGTH,
} from "@domain/shared"
import { z } from "zod"

const datasetSchema = z.object({
  id: datasetIdSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  slug: z.string().min(1).max(SLUG_MAX_LENGTH), // url-safe identifier derived from name; regenerated when name changes. Unique per (organization_id, project_id) among non-soft-deleted rows.
  name: z.string().min(1),
  description: z.string().nullable(),
  fileKey: z.string().nullable(),
  currentVersion: z.number().int().nonnegative(),
  latestVersionId: datasetVersionIdSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Dataset = z.infer<typeof datasetSchema>

const datasetVersionSchema = z.object({
  id: datasetVersionIdSchema,
  datasetId: datasetIdSchema,
  version: z.number().int().positive(),
  rowsInserted: z.number().int().nonnegative(),
  rowsUpdated: z.number().int().nonnegative(),
  rowsDeleted: z.number().int().nonnegative(),
  source: z.string().min(1),
  actorId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type DatasetVersion = z.infer<typeof datasetVersionSchema>
