import type { ProjectId, SavedSearchId } from "@domain/shared"
import { toSlug } from "@domain/shared"
import { Effect } from "effect"
import { SAVED_SEARCH_SLUG_COLLISION_LIMIT, SAVED_SEARCH_SLUG_MAX_LENGTH } from "../constants.ts"
import { InvalidSavedSearchNameError } from "../errors.ts"
import { SavedSearchRepository } from "../ports/saved-search-repository.ts"

export const generateUniqueSlug = Effect.fn("savedSearches.generateUniqueSlug")(function* (args: {
  readonly projectId: ProjectId
  readonly name: string
  readonly excludeId?: SavedSearchId
}) {
  const baseSlug = toSlug(args.name).slice(0, SAVED_SEARCH_SLUG_MAX_LENGTH)
  if (!baseSlug || baseSlug.length === 0) {
    return yield* new InvalidSavedSearchNameError({
      field: "name",
      message: "Name does not produce a valid slug",
    })
  }

  const repo = yield* SavedSearchRepository

  for (let i = 0; i <= SAVED_SEARCH_SLUG_COLLISION_LIMIT; i++) {
    const candidate = i === 0 ? baseSlug : `${baseSlug.slice(0, SAVED_SEARCH_SLUG_MAX_LENGTH - `-${i}`.length)}-${i}`

    const exists = yield* repo.existsBySlug({
      projectId: args.projectId,
      slug: candidate,
      ...(args.excludeId ? { excludeId: args.excludeId } : {}),
    })
    if (!exists) return candidate
  }

  return yield* new InvalidSavedSearchNameError({
    field: "name",
    message: "Could not generate a unique slug — try a different name",
  })
})
