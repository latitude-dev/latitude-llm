import type { Dataset } from "@domain/datasets"
import { cuidSchema } from "@domain/shared"
import { z } from "@hono/zod-openapi"
import { Paginated } from "../pagination.ts"

export const DATASET_SORT_FIELDS = ["name", "updatedAt"] as const

const DatasetSchema = z
  .object({
    id: cuidSchema.describe("Stable dataset identifier."),
    organizationId: cuidSchema.describe("Organization that owns this dataset."),
    projectId: cuidSchema.describe("Project this dataset belongs to."),
    slug: z.string().describe("URL-safe slug derived from `name`. Unique within the project."),
    name: z.string().describe("Human-readable name."),
    description: z.string().nullable().describe("Free-form description, or `null` when not set."),
    version: z.number().int().nonnegative().describe("Current dataset version."),
    createdAt: z.string().describe("ISO-8601 timestamp of creation."),
    updatedAt: z.string().describe("ISO-8601 timestamp of the last update."),
  })
  .openapi("Dataset")

export const PaginatedDatasetsSchema = Paginated(DatasetSchema, "PaginatedDatasets")

export const toDatasetResponse = (dataset: Dataset) => ({
  id: dataset.id as string,
  organizationId: dataset.organizationId as string,
  projectId: dataset.projectId as string,
  slug: dataset.slug,
  name: dataset.name,
  description: dataset.description,
  version: dataset.currentVersion,
  createdAt: dataset.createdAt.toISOString(),
  updatedAt: dataset.updatedAt.toISOString(),
})

export { DatasetSchema }
