import {
  datasetIdSchema,
  datasetVersionIdSchema,
  organizationIdSchema,
  projectIdSchema,
  SLUG_MAX_LENGTH,
} from "@domain/shared"
import { z } from "zod"

// The four fixed row fields. Custom columns never project into these — they live in the row's `custom` store.
export const BUILTIN_FIELDS = ["input", "output", "expectedOutput", "metadata"] as const
export type BuiltinField = (typeof BUILTIN_FIELDS)[number]

const datasetColumnSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("builtin"), field: z.enum(BUILTIN_FIELDS) }),
  z.object({ kind: z.literal("custom") }),
])

export type DatasetColumnSource = z.infer<typeof datasetColumnSourceSchema>

export const datasetColumnSchema = z.object({
  identifier: z.string().min(1), // stable, immutable id (rename-safe); also the key used in row `custom` storage
  name: z.string().min(1),
  source: datasetColumnSourceSchema,
  // Soft-delete: removed columns (built-in or custom) are excluded from the table/API/rows but kept so
  // they can be re-added with their data intact. Absent ⇒ active. Built-in row fields are never erased.
  removed: z.boolean().optional(),
})

export type DatasetColumn = z.infer<typeof datasetColumnSchema>

const datasetSchema = z.object({
  id: datasetIdSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  slug: z.string().min(1).max(SLUG_MAX_LENGTH), // url-safe identifier derived from name; regenerated when name changes. Unique per (organization_id, project_id) among non-soft-deleted rows.
  name: z.string().min(1),
  description: z.string().nullable(),
  fileKey: z.string().nullable(),
  columns: z.array(datasetColumnSchema).nullable(), // null ⇒ exactly today's behavior: four built-in fields, all visible, no custom columns.
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
