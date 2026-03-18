import {
  type ConflictError,
  defineError,
  defineErrorDynamic,
  type OrganizationId,
  type RepositoryError,
  type UserId,
  type ValidationError,
} from "@domain/shared"
import { Effect } from "effect"
import { createOrganization } from "../entities/organization.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"
import { generateUniqueOrganizationSlugUseCase } from "./generate-unique-organization-slug.ts"

export interface CreateOrganizationInput {
  readonly id?: OrganizationId
  readonly name: string
  readonly creatorId: UserId
}

export class OrganizationAlreadyExistsError extends defineError(
  "OrganizationAlreadyExistsError",
  409,
  "Organization already exists",
)<{
  readonly slug: string
}> {}

export class InvalidOrganizationNameError extends defineErrorDynamic(
  "InvalidOrganizationNameError",
  400,
  (f: { reason: string }) => f.reason,
)<{
  readonly name: string
  readonly reason: string
}> {}

export type CreateOrganizationError =
  | RepositoryError
  | ValidationError
  | ConflictError
  | OrganizationAlreadyExistsError
  | InvalidOrganizationNameError

export const createOrganizationUseCase = (input: CreateOrganizationInput) =>
  Effect.gen(function* () {
    const repository = yield* OrganizationRepository

    if (!input.name || input.name.trim().length === 0) {
      return yield* new InvalidOrganizationNameError({
        name: input.name,
        reason: "Name cannot be empty",
      })
    }

    if (input.name.length > 256) {
      return yield* new InvalidOrganizationNameError({
        name: input.name,
        reason: "Name exceeds 256 characters",
      })
    }

    const slug = yield* generateUniqueOrganizationSlugUseCase({ name: input.name })

    const exists = yield* repository.existsBySlug(slug)
    if (exists) {
      return yield* new OrganizationAlreadyExistsError({ slug })
    }

    const organization = createOrganization({
      id: input.id,
      name: input.name.trim(),
      slug,
      creatorId: input.creatorId,
    })

    yield* repository.save(organization)

    return organization
  })
