import type { NotFoundError, OrganizationId, RepositoryError } from "@domain/shared-kernel"
import type { Effect } from "effect"
import type { Organization } from "../entities/organization.ts"

/**
 * Repository port for Organization entities.
 *
 * This interface defines the contract for organization persistence operations.
 * Implementations are provided in the platform layer (e.g., Postgres adapter).
 */
export interface OrganizationRepository {
  /**
   * Find an organization by its unique ID.
   */
  findById(id: OrganizationId): Effect.Effect<Organization, NotFoundError | RepositoryError>

  /**
   * Find all organizations for the current user (via Better Auth membership).
   * RLS policies ensure only organizations the user is a member of are returned.
   */
  findAll(): Effect.Effect<readonly Organization[], RepositoryError>

  /**
   * Save an organization (create or update).
   */
  save(organization: Organization): Effect.Effect<void, RepositoryError>

  /**
   * Delete an organization by ID.
   */
  delete(id: OrganizationId): Effect.Effect<void, RepositoryError>

  /**
   * Check if an organization exists with the given slug.
   */
  existsBySlug(slug: string): Effect.Effect<boolean, RepositoryError>
}
