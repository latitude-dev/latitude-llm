import { FacetId, generateId, generateSlug, type ProjectId, SqlClient, toSlug } from "@domain/shared"
import { Effect } from "effect"
import {
  FACET_DESCRIPTION_MAX_LENGTH,
  FACET_INSTRUCTIONS_MAX_LENGTH,
  FACET_NAME_MAX_LENGTH,
  MAX_FACETS_PER_PROJECT,
} from "../constants.ts"
import type { TaxonomyFacet } from "../entities/facet.ts"
import { FacetInvalidError, FacetLimitReachedError } from "../errors.ts"
import { FacetRepository } from "../ports/facet-repository.ts"

export interface CreateFacetInput {
  readonly id?: FacetId
  readonly projectId: ProjectId
  readonly name: string
  readonly description: string
  /** Write-once free-text guidance compiled into the extraction prompt. */
  readonly instructions: string
}

/** Persist a facet — an immutable lens definition. It gardens only when a custom behavior selects it. */
export const createFacet = Effect.fn("taxonomy.createFacet")(function* (input: CreateFacetInput) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)

  const trimmedName = input.name.trim()
  if (trimmedName.length === 0) {
    return yield* new FacetInvalidError({ field: "name", message: "Name cannot be empty" })
  }
  if (trimmedName.length > FACET_NAME_MAX_LENGTH) {
    return yield* new FacetInvalidError({ field: "name", message: `Name exceeds ${FACET_NAME_MAX_LENGTH} characters` })
  }
  if (toSlug(trimmedName).length === 0) {
    return yield* new FacetInvalidError({
      field: "name",
      message: "Name must contain at least one letter or number",
    })
  }
  const trimmedInstructions = input.instructions.trim()
  if (trimmedInstructions.length === 0) {
    return yield* new FacetInvalidError({ field: "instructions", message: "Instructions cannot be empty" })
  }
  if (trimmedInstructions.length > FACET_INSTRUCTIONS_MAX_LENGTH) {
    return yield* new FacetInvalidError({
      field: "instructions",
      message: `Instructions exceed ${FACET_INSTRUCTIONS_MAX_LENGTH} characters`,
    })
  }
  const trimmedDescription = input.description.trim()
  if (trimmedDescription.length === 0) {
    return yield* new FacetInvalidError({ field: "description", message: "Description cannot be empty" })
  }
  if (trimmedDescription.length > FACET_DESCRIPTION_MAX_LENGTH) {
    return yield* new FacetInvalidError({
      field: "description",
      message: `Description exceeds ${FACET_DESCRIPTION_MAX_LENGTH} characters`,
    })
  }

  const sqlClient = yield* SqlClient
  const created = yield* sqlClient.transaction(
    Effect.gen(function* () {
      const repo = yield* FacetRepository

      // Soft cost guard (count-based, not locked, so concurrent creates may briefly overshoot).
      const existing = yield* repo.countByProject({ projectId: input.projectId })
      if (existing >= MAX_FACETS_PER_PROJECT) {
        return yield* new FacetLimitReachedError({ projectId: input.projectId, limit: MAX_FACETS_PER_PROJECT })
      }

      const slug = yield* generateSlug({
        name: trimmedName,
        count: (slug) => repo.countBySlug({ projectId: input.projectId, slug }),
      })

      const now = new Date()
      const facet: TaxonomyFacet = {
        id: input.id ?? FacetId(generateId()),
        organizationId: sqlClient.organizationId,
        projectId: input.projectId,
        slug,
        name: trimmedName,
        description: trimmedDescription,
        instructions: trimmedInstructions,
        createdAt: now,
        updatedAt: now,
      }

      yield* repo.save(facet)
      return facet
    }),
  )

  return created
})
