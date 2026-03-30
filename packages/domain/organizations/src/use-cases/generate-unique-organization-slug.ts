import { generateId, toSlug } from "@domain/shared"
import { Data, Effect } from "effect"
import { OrganizationRepository } from "../ports/organization-repository.ts"

const MAX_SLUG_ATTEMPTS = 20

export class SlugGenerationError extends Data.TaggedError("SlugGenerationError")<{
  readonly message: string
}> {}

export const generateUniqueOrganizationSlugUseCase = (input: { name: string }) =>
  Effect.gen(function* () {
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
  })
