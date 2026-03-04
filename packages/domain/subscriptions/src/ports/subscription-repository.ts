import type { RepositoryError, ScopedRepository, SubscriptionId } from "@domain/shared"
import type { Effect } from "effect"
import type { Subscription } from "../entities/subscription.ts"

/**
 * Repository port for Subscription entities.
 *
 * This interface defines the contract for subscription persistence operations.
 * Implementations are provided in the platform layer (e.g., Postgres adapter).
 */
export interface SubscriptionRepository extends ScopedRepository {
  /**
   * Find a subscription by its unique ID.
   */
  findById(id: SubscriptionId): Effect.Effect<Subscription | null, RepositoryError>

  /**
   * Find the active subscription.
   */
  findActive(): Effect.Effect<Subscription | null, RepositoryError>

  /**
   * Find all subscriptions (including past ones).
   */
  findAll(): Effect.Effect<readonly Subscription[], RepositoryError>

  /**
   * Save a subscription (create or update).
   */
  save(subscription: Subscription): Effect.Effect<void, RepositoryError>

  /**
   * Delete a subscription by ID.
   */
  delete(id: SubscriptionId): Effect.Effect<void, RepositoryError>

  /**
   * Check if a subscription exists.
   */
  exists(): Effect.Effect<boolean, RepositoryError>
}
