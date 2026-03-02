import type { OrganizationId, RepositoryError } from "@domain/shared-kernel";
import type { Effect } from "effect";
import type { Membership } from "../entities/membership.ts";

/**
 * Repository port for Membership entities.
 *
 * This interface defines the contract for membership persistence operations.
 * Note: Actual auth membership data is in Better Auth, this is for domain queries.
 */
export interface MembershipRepository {
  /**
   * Find a membership by ID.
   */
  findById(id: string): Effect.Effect<Membership | null, RepositoryError>;

  /**
   * Find all memberships for an organization.
   */
  findByOrganizationId(
    organizationId: OrganizationId,
  ): Effect.Effect<readonly Membership[], RepositoryError>;

  /**
   * Find all memberships for a user.
   */
  findByUserId(userId: string): Effect.Effect<readonly Membership[], RepositoryError>;

  /**
   * Find membership by organization and user.
   */
  findByOrganizationAndUser(
    organizationId: OrganizationId,
    userId: string,
  ): Effect.Effect<Membership | null, RepositoryError>;

  /**
   * Check if user is a member of organization.
   */
  isMember(organizationId: OrganizationId, userId: string): Effect.Effect<boolean, RepositoryError>;

  /**
   * Check if user has admin role in organization.
   */
  isAdmin(organizationId: OrganizationId, userId: string): Effect.Effect<boolean, RepositoryError>;

  /**
   * Save a membership.
   */
  save(membership: Membership): Effect.Effect<void, RepositoryError>;

  /**
   * Delete a membership.
   */
  delete(id: string): Effect.Effect<void, RepositoryError>;
}
