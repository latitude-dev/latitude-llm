import type { FilterSet, ProjectId, SavedSearchId, UserId } from "@domain/shared"
import { Effect } from "effect"
import { SAVED_SEARCH_NAME_MAX_LENGTH } from "../constants.ts"
import { isEmptySearch } from "../entities/saved-search.ts"
import { EmptySavedSearchError, InvalidSavedSearchNameError } from "../errors.ts"
import { SavedSearchRepository } from "../ports/saved-search-repository.ts"
import { generateUniqueSlug } from "./generate-unique-slug.ts"

export interface CreateSavedSearchInput {
  readonly id?: SavedSearchId
  readonly projectId: ProjectId
  readonly name: string
  readonly query: string | null
  readonly filterSet: FilterSet
  readonly assignedUserId?: UserId | null
  readonly createdByUserId: UserId
}

export const createSavedSearch = Effect.fn("savedSearches.createSavedSearch")(function* (
  input: CreateSavedSearchInput,
) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)

  const trimmedName = input.name.trim()
  if (trimmedName.length === 0) {
    return yield* new InvalidSavedSearchNameError({ field: "name", message: "Name cannot be empty" })
  }
  if (trimmedName.length > SAVED_SEARCH_NAME_MAX_LENGTH) {
    return yield* new InvalidSavedSearchNameError({
      field: "name",
      message: `Name exceeds ${SAVED_SEARCH_NAME_MAX_LENGTH} characters`,
    })
  }

  const trimmedQuery = input.query?.trim() ?? null
  const normalizedQuery = trimmedQuery && trimmedQuery.length > 0 ? trimmedQuery : null
  if (isEmptySearch({ query: normalizedQuery, filterSet: input.filterSet })) {
    return yield* new EmptySavedSearchError({})
  }

  const slug = yield* generateUniqueSlug({ projectId: input.projectId, name: trimmedName })

  const repo = yield* SavedSearchRepository
  return yield* repo.create({
    ...(input.id ? { id: input.id } : {}),
    projectId: input.projectId,
    slug,
    name: trimmedName,
    query: normalizedQuery,
    filterSet: input.filterSet,
    assignedUserId: input.assignedUserId ?? null,
    createdByUserId: input.createdByUserId,
  })
})
