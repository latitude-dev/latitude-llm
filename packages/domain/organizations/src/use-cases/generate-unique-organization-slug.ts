import { type RepositoryError, generateId } from "@domain/shared-kernel"
import { Effect } from "effect"
import type { OrganizationRepository } from "../ports/organization-repository.ts"

const MAX_SLUG_ATTEMPTS = 20

const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

export const generateUniqueOrganizationSlugUseCase =
  (repository: OrganizationRepository) =>
  (input: { name: string }): Effect.Effect<string, RepositoryError> => {
    return Effect.gen(function* () {
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

      return slug
    })
  }
