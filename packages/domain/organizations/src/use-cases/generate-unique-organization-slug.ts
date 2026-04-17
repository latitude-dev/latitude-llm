import { generateId, toSlug } from "@domain/shared"
import { Effect } from "effect"
import { SlugGenerationError } from "../errors.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"

const MAX_SLUG_ATTEMPTS = 20

export const generateUniqueOrganizationSlugUseCase = Effect.fn("organizations.generateUniqueOrganizationSlug")(
  function* (input: { name: string }) {
    const repository = yield* OrganizationRepository

    let slugBase = toSlug(input.name)

    if (!slugBase) {
      slugBase = `workspace-${generateId().slice(0, 8)}`
    }

    let slug = slugBase
    for (let i = 1; i <= MAX_SLUG_ATTEMPTS; i += 1) {
      const exists = yield* repository.existsBySlug(slug)
      if (!exists) {
        return slug
      }
      slug = `${slugBase}-${i}`
    }

    // If we exhausted all attempts, return an error effect
    return yield* new SlugGenerationError({
      message: `Could not generate a unique slug after ${MAX_SLUG_ATTEMPTS} attempts`,
    })
  },
)
