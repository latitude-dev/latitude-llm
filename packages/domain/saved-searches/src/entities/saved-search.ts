import {
  filterSetSchema,
  organizationIdSchema,
  projectIdSchema,
  savedSearchIdSchema,
  userIdSchema,
} from "@domain/shared"
import { z } from "zod"
import {
  SAVED_SEARCH_NAME_MAX_LENGTH,
  SAVED_SEARCH_QUERY_MAX_LENGTH,
  SAVED_SEARCH_SLUG_MAX_LENGTH,
} from "../constants.ts"

export const savedSearchSchema = z.object({
  id: savedSearchIdSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  slug: z.string().min(1).max(SAVED_SEARCH_SLUG_MAX_LENGTH),
  name: z.string().min(1).max(SAVED_SEARCH_NAME_MAX_LENGTH),
  query: z.string().max(SAVED_SEARCH_QUERY_MAX_LENGTH).nullable(),
  filterSet: filterSetSchema,
  assignedUserId: userIdSchema.nullable(),
  createdByUserId: userIdSchema,
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type SavedSearch = z.infer<typeof savedSearchSchema>

export const isEmptySearch = (search: { query: string | null; filterSet: SavedSearch["filterSet"] }): boolean => {
  const trimmedQuery = search.query?.trim() ?? ""
  if (trimmedQuery.length > 0) return false
  return Object.keys(search.filterSet).length === 0
}
