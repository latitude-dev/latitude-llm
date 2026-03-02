import type { OrganizationId, RepositoryError, SubscriptionId } from "@domain/shared-kernel"
import type { Effect } from "effect"
import type { Subscription } from "../entities/subscription.ts"

/**
 * Repository port for Subscription entities.
 *
 * This interface defines the contract for subscription persistence operations.
 * Implementations are provided in the platform layer (e.g., Postgres adapter).
 */
export interface SubscriptionRepository {
  /**
   * Find a subscription by its unique ID.
   */
  findById(id: SubscriptionId): Effect.Effect<Subscription | null, RepositoryError>

  /**
   * Find the active subscription for an organization.
   */
  findActiveByOrganizationId(organizationId: OrganizationId): Effect.Effect<Subscription | null, RepositoryError>

  /**
   * Find all subscriptions for an organization (including past ones).
   */
  findByOrganizationId(organizationId: OrganizationId): Effect.Effect<readonly Subscription[], RepositoryError>

  /**
   * Save a subscription (create or update).
   */
  save(subscription: Subscription): Effect.Effect<void, RepositoryError>

  /**
   * Delete a subscription by ID.
   */
  delete(id: SubscriptionId): Effect.Effect<void, RepositoryError>

  /**
   * Check if a subscription exists for an organization.
   */
  existsForOrganization(organizationId: OrganizationId): Effect.Effect<boolean, RepositoryError>
}
