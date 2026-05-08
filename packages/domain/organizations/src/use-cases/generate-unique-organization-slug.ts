import { generateId, generateSlug } from "@domain/shared"
import { Effect } from "effect"
import { SlugGenerationError } from "../errors.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"

/**
 * Thin wrapper around the shared `generateSlug` helper that fans the unique
 * organization slug check out to {@link OrganizationRepository}. Exists as a
 * named use case (rather than an inline call) because the web's organization
 * provisioning flow needs a fallback on empty `name` (e.g. organizations
 * created via OAuth signup with a placeholder display name) — `generateSlug`
 * itself fails on input that produces no URL-safe characters, so we feed it
 * a generated workspace placeholder in that case.
 */
export const generateUniqueOrganizationSlugUseCase = Effect.fn("organizations.generateUniqueOrganizationSlug")(
  function* (input: { name: string }) {
    const repository = yield* OrganizationRepository
    const fallbackName = `workspace-${generateId().slice(0, 8)}`

    return yield* generateSlug({
      name: input.name?.trim() ? input.name : fallbackName,
      count: (slug) => repository.countBySlug(slug),
    }).pipe(
      Effect.catchTag("InvalidSlugInputError", () =>
        // Retry with the placeholder name if `toSlug(name)` produced an empty
        // base. Won't recurse: the placeholder is guaranteed to slugify cleanly.
        generateSlug({
          name: fallbackName,
          count: (slug) => repository.countBySlug(slug),
        }).pipe(
          Effect.catchTag("InvalidSlugInputError", (error) =>
            Effect.fail(new SlugGenerationError({ message: error.reason })),
          ),
        ),
      ),
    )
  },
)
