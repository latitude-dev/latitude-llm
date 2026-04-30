import type { FilterSet, SavedSearchId, UserId } from "@domain/shared"
import { toSlug } from "@domain/shared"
import { Effect } from "effect"
import { SAVED_SEARCH_NAME_MAX_LENGTH, SAVED_SEARCH_SLUG_MAX_LENGTH } from "../constants.ts"
import { isEmptySearch } from "../entities/saved-search.ts"
import { EmptySavedSearchError, InvalidSavedSearchNameError } from "../errors.ts"
import { SavedSearchRepository } from "../ports/saved-search-repository.ts"
import { generateUniqueSlug } from "./generate-unique-slug.ts"

export interface UpdateSavedSearchInput {
  readonly id: SavedSearchId
  readonly name?: string
  readonly query?: string | null
  readonly filterSet?: FilterSet
  readonly assignedUserId?: UserId | null
}

export const updateSavedSearch = Effect.fn("savedSearches.updateSavedSearch")(function* (
  input: UpdateSavedSearchInput,
) {
  yield* Effect.annotateCurrentSpan("savedSearchId", input.id)

  const repo = yield* SavedSearchRepository
  const current = yield* repo.findById(input.id)

  let nextName = current.name
  let nameChanged = false
  if (input.name !== undefined) {
    const trimmed = input.name.trim()
    if (trimmed.length === 0) {
      return yield* new InvalidSavedSearchNameError({ field: "name", message: "Name cannot be empty" })
    }
    if (trimmed.length > SAVED_SEARCH_NAME_MAX_LENGTH) {
      return yield* new InvalidSavedSearchNameError({
        field: "name",
        message: `Name exceeds ${SAVED_SEARCH_NAME_MAX_LENGTH} characters`,
      })
    }
    if (trimmed !== current.name) {
      nextName = trimmed
      nameChanged = true
    }
  }

  let nextQuery = current.query
  let queryChanged = false
  if (input.query !== undefined) {
    const trimmed = input.query?.trim() ?? null
    const normalized = trimmed && trimmed.length > 0 ? trimmed : null
    if (normalized !== current.query) {
      nextQuery = normalized
      queryChanged = true
    }
  }

  const nextFilterSet = input.filterSet ?? current.filterSet

  if (isEmptySearch({ query: nextQuery, filterSet: nextFilterSet })) {
    return yield* new EmptySavedSearchError({})
  }

  let nextSlug: string | undefined
  if (nameChanged) {
    const candidateSlug = toSlug(nextName).slice(0, SAVED_SEARCH_SLUG_MAX_LENGTH)
    if (candidateSlug !== current.slug) {
      nextSlug = yield* generateUniqueSlug({
        projectId: current.projectId,
        name: nextName,
        excludeId: input.id,
      })
    }
  }

  return yield* repo.update({
    id: input.id,
    projectId: current.projectId,
    ...(nameChanged ? { name: nextName } : {}),
    ...(nextSlug !== undefined ? { slug: nextSlug } : {}),
    ...(queryChanged ? { query: nextQuery } : {}),
    ...(input.filterSet !== undefined ? { filterSet: input.filterSet } : {}),
    ...(input.assignedUserId !== undefined && input.assignedUserId !== current.assignedUserId
      ? { assignedUserId: input.assignedUserId }
      : {}),
  })
})
