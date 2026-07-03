import { createOrganization, OrganizationRepository } from "@domain/organizations"
import { type ConcurrentSqlTransactionError, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { createShowcase, type Showcase } from "../entities/showcase.ts"
import { ShowcaseAlreadyExistsError } from "../errors.ts"
import { ShowcaseRepository } from "../ports/showcase-repository.ts"

export const SHOWCASE_ORG_NAME = "Showcase"
export const SHOWCASE_ORG_SLUG = "showcase"

export interface CreateShowcaseInput {
  readonly name?: string
  readonly slug?: string
}

export type CreateShowcaseError = ShowcaseAlreadyExistsError | RepositoryError | ConcurrentSqlTransactionError

/**
 * Bootstraps the showcase: creates its dedicated organization and inserts the
 * singleton pointer row (`currentProjectId` null — no project is built yet).
 *
 * Fails loudly if a showcase already exists. The explicit `find` check gives a
 * clean domain error; the `id = 1` PK guard is the race-proof backstop that
 * turns a concurrent second create into a `RepositoryError`.
 */
export const createShowcaseUseCase = Effect.fn("showcase.create")(function* (input: CreateShowcaseInput = {}) {
  const sqlClient = yield* SqlClient

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const showcaseRepo = yield* ShowcaseRepository
      const organizationRepo = yield* OrganizationRepository

      const existing = yield* showcaseRepo.find()
      if (existing) {
        return yield* Effect.fail(new ShowcaseAlreadyExistsError({ organizationId: existing.organizationId }))
      }

      const organization = createOrganization({
        name: input.name ?? SHOWCASE_ORG_NAME,
        slug: input.slug ?? SHOWCASE_ORG_SLUG,
      })
      yield* organizationRepo.save(organization)

      return yield* showcaseRepo.create(createShowcase({ organizationId: organization.id }))
    }),
  )
}) satisfies (
  input?: CreateShowcaseInput,
) => Effect.Effect<Showcase, CreateShowcaseError, SqlClient | ShowcaseRepository | OrganizationRepository>
