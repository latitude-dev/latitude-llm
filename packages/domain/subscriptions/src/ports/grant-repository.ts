import type { GrantId, OrganizationId, RepositoryError, SubscriptionId } from "@domain/shared-kernel"
import type { Effect } from "effect"
import type { Grant, GrantType } from "../entities/grant.ts"

/**
 * Repository port for Grant entities.
 *
 * This interface defines the contract for grant persistence operations.
 * Implementations are provided in the platform layer (e.g., Postgres adapter).
 */
export interface GrantRepository {
  /**
   * Find a grant by its unique ID.
   */
  findById(id: GrantId): Effect.Effect<Grant | null, RepositoryError>

  /**
   * Find all grants for an organization.
   */
  findByOrganizationId(organizationId: OrganizationId): Effect.Effect<readonly Grant[], RepositoryError>

  /**
   * Find all grants for a specific subscription.
   */
  findBySubscriptionId(subscriptionId: SubscriptionId): Effect.Effect<readonly Grant[], RepositoryError>

  /**
   * Find active grants (not expired, with remaining balance) by type for an organization.
   */
  findActiveByType(organizationId: OrganizationId, type: GrantType): Effect.Effect<readonly Grant[], RepositoryError>

  /**
   * Find all active grants for an organization across all types.
   */
  findAllActive(organizationId: OrganizationId): Effect.Effect<readonly Grant[], RepositoryError>

  /**
   * Save a grant (create or update).
   */
  save(grant: Grant): Effect.Effect<void, RepositoryError>

  /**
   * Save multiple grants in a batch.
   */
  saveMany(grants: readonly Grant[]): Effect.Effect<void, RepositoryError>

  /**
   * Revoke all grants for a subscription (set balance to 0).
   */
  revokeBySubscription(subscriptionId: SubscriptionId): Effect.Effect<void, RepositoryError>

  /**
   * Delete a grant by ID.
   */
  delete(id: GrantId): Effect.Effect<void, RepositoryError>

  /**
   * Delete all grants for a subscription.
   */
  deleteBySubscription(subscriptionId: SubscriptionId): Effect.Effect<void, RepositoryError>
}
