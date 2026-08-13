import { FacetId, generateId, generateSlug, type ProjectId, SqlClient, toSlug } from "@domain/shared"
import { Effect } from "effect"
import {
  FACET_DESCRIPTION_MAX_LENGTH,
  FACET_INSTRUCTIONS_MAX_LENGTH,
  FACET_NAME_MAX_LENGTH,
  FACET_PRESET_SLUG_PREFIX,
} from "../constants.ts"
import type { TaxonomyFacet } from "../entities/facet.ts"
import { FacetInvalidError } from "../errors.ts"
import { FacetRepository } from "../ports/facet-repository.ts"

export interface CreateFacetInput {
  readonly id?: FacetId
  readonly projectId: ProjectId
  readonly name: string
  readonly description: string
  /** Write-once free-text guidance compiled into the extraction prompt. */
  readonly instructions: string
  /**
   * Fixed reserved slug for a preset find-or-create. Omit for a user-authored
   * facet, which slugifies its name and is rejected if that lands in the reserved
   * `lat-` namespace.
   */
  readonly slug?: string
}

/**
 * Validate a facet's three presentation/extraction fields and resolve its slug,
 * returning the row WITHOUT persisting it. Shared by `createFacet` and the facet
 * selection resolver so both a standalone create and a find-or-create inside the
 * create-behavior transaction validate identically. Runs on the ambient
 * `SqlClient`/`FacetRepository`, so it composes inside a caller's transaction.
 */
export const buildFacet = (input: CreateFacetInput) =>
  Effect.gen(function* () {
    const trimmedName = input.name.trim()
    if (trimmedName.length === 0) {
      return yield* new FacetInvalidError({ field: "name", message: "Name cannot be empty" })
    }
    if (trimmedName.length > FACET_NAME_MAX_LENGTH) {
      return yield* new FacetInvalidError({
        field: "name",
        message: `Name exceeds ${FACET_NAME_MAX_LENGTH} characters`,
      })
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
    const repo = yield* FacetRepository

    let slug: string
    if (input.slug != null) {
      // Preset find-or-create supplies the fixed reserved slug directly.
      slug = input.slug
    } else {
      slug = yield* generateSlug({
        name: trimmedName,
        count: (candidate) => repo.countBySlug({ projectId: input.projectId, slug: candidate }),
      })
      // The `lat-` namespace belongs to the preset catalog; a user-authored name
      // that slugifies into it is rejected so a preset can never be shadowed.
      if (slug.startsWith(FACET_PRESET_SLUG_PREFIX)) {
        return yield* new FacetInvalidError({
          field: "name",
          message: `Names starting with "${FACET_PRESET_SLUG_PREFIX}" are reserved`,
        })
      }
    }

    const now = new Date()
    return {
      id: input.id ?? FacetId(generateId()),
      organizationId: sqlClient.organizationId,
      projectId: input.projectId,
      slug,
      name: trimmedName,
      description: trimmedDescription,
      instructions: trimmedInstructions,
      createdAt: now,
      updatedAt: now,
    } satisfies TaxonomyFacet
  })

/** Persist a facet, an immutable definition. It gardens only when a custom behavior selects it. */
export const createFacet = Effect.fn("taxonomy.createFacet")(function* (input: CreateFacetInput) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)

  const sqlClient = yield* SqlClient
  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const facet = yield* buildFacet(input)
      const repo = yield* FacetRepository
      yield* repo.save(facet)
      return facet
    }),
  )
})
