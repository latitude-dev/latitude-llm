import { datasetIdSchema, datasetVersionIdSchema, organizationIdSchema, projectIdSchema } from "@domain/shared"
import { z } from "zod"

export const datasetSchema = z.object({
  id: datasetIdSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  name: z.string().min(1),
  description: z.string().nullable(),
  fileKey: z.string().nullable(),
  currentVersion: z.number().int().nonnegative(),
  latestVersionId: datasetVersionIdSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Dataset = z.infer<typeof datasetSchema>

export const datasetVersionSchema = z.object({
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
