import type { SavedSearch } from "@domain/saved-searches"
import { cuidSchema } from "@domain/shared"
import { z } from "@hono/zod-openapi"
import { FilterSetSchema } from "../schemas.ts"

const savedSearchFields = {
  id: cuidSchema.describe("Stable saved-search identifier."),
  organizationId: cuidSchema.describe("Organization that owns this saved search."),
  projectId: cuidSchema.describe("Project this saved search belongs to."),
  slug: z
    .string()
    .describe("URL-safe slug derived from `name`. Regenerated when the name changes in a way that affects the slug."),
  name: z.string().describe("Human-readable name."),
  query: z
    .string()
    .nullable()
    .describe(
      "Free-text semantic query applied alongside `filters`. `null` when the search is filter-only. At least one of `query` or `filters` must be set.",
    ),
  filters: FilterSetSchema.describe(
    "Structured filter set applied alongside `query`. Empty object means filter-free. At least one of `query` or `filters` must be set.",
  ),
  assignedUserId: cuidSchema
    .nullable()
    .describe("User this search is assigned to, if any. `null` when the search is unassigned."),
  createdByUserId: cuidSchema.describe("User who created the saved search."),
  deletedAt: z.string().nullable().describe("ISO-8601 timestamp at which the search was deleted. `null` while active."),
  createdAt: z.string().describe("ISO-8601 timestamp of creation."),
  updatedAt: z.string().describe("ISO-8601 timestamp of the last update."),
} as const

export const SavedSearchSchema = z.object(savedSearchFields).openapi("SavedSearch")

export const toSavedSearchResponse = (search: SavedSearch) => ({
  id: search.id as string,
  organizationId: search.organizationId as string,
  projectId: search.projectId as string,
  slug: search.slug,
  name: search.name,
  query: search.query,
  filters: search.filterSet,
  assignedUserId: search.assignedUserId as string | null,
  createdByUserId: search.createdByUserId as string,
  deletedAt: search.deletedAt ? search.deletedAt.toISOString() : null,
  createdAt: search.createdAt.toISOString(),
  updatedAt: search.updatedAt.toISOString(),
})
