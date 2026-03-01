import type {
  ConflictError,
  OrganizationId,
  RepositoryError,
  UserId,
  ValidationError,
} from "@domain/shared-kernel";
import { Data, Effect } from "effect";
import { type Organization, createOrganization } from "../entities/organization.js";
import type { OrganizationRepository } from "../ports/organization-repository.js";

/**
 * Create a new organization.
 *
 * This use case:
 * 1. Validates the organization name and slug
 * 2. Checks for slug uniqueness
 * 3. Creates the organization entity
 * 4. Persists to the repository
 * 5. Returns the created organization
 */
export interface CreateOrganizationInput {
  readonly id: OrganizationId;
  readonly name: string;
  readonly slug: string;
  readonly creatorId: UserId;
}

export class OrganizationAlreadyExistsError extends Data.TaggedError(
  "OrganizationAlreadyExistsError",
)<{
  readonly slug: string;
}> {
  readonly httpStatus = 409;
  readonly httpMessage = "Organization already exists";
}

export class InvalidOrganizationNameError extends Data.TaggedError("InvalidOrganizationNameError")<{
  readonly name: string;
  readonly reason: string;
}> {
  readonly httpStatus = 400;
  get httpMessage() {
    return this.reason;
  }
}

export type CreateOrganizationError =
  | RepositoryError
  | ValidationError
  | ConflictError
  | OrganizationAlreadyExistsError
  | InvalidOrganizationNameError;

export const createOrganizationUseCase =
  (repository: OrganizationRepository) =>
  (input: CreateOrganizationInput): Effect.Effect<Organization, CreateOrganizationError> => {
    return Effect.gen(function* () {
      // Validate name
      if (!input.name || input.name.trim().length === 0) {
        return yield* new InvalidOrganizationNameError({
          name: input.name,
          reason: "Name cannot be empty",
        });
      }

      if (input.name.length > 256) {
        return yield* new InvalidOrganizationNameError({
          name: input.name,
          reason: "Name exceeds 256 characters",
        });
      }

      // Validate slug
      if (!input.slug || input.slug.trim().length === 0) {
        return yield* new InvalidOrganizationNameError({
          name: input.slug,
          reason: "Slug cannot be empty",
        });
      }

      // Check if slug already exists
      const exists = yield* repository.existsBySlug(input.slug);
      if (exists) {
        return yield* new OrganizationAlreadyExistsError({ slug: input.slug });
      }

      // Create organization entity
      const organization = createOrganization({
        id: input.id,
        name: input.name.trim(),
        slug: input.slug.trim().toLowerCase(),
        creatorId: input.creatorId,
      });

      // Persist
      yield* repository.save(organization);

      return organization;
    });
  };
