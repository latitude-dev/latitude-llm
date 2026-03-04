import type { ApiKeyId, RepositoryError, ScopedRepository } from "@domain/shared"
import type { Effect } from "effect"
import type { ApiKey } from "../entities/api-key.ts"

/**
 * Repository port for API Key entities.
 *
 * This interface defines the contract for API key persistence operations.
 * All operations are scoped to a single organization for data isolation.
 *
 * For cross-organization operations (e.g., authentication lookups),
 * use UnscopedApiKeyRepository instead.
 *
 * Implementations are provided in the platform layer (e.g., Postgres adapter).
 */
export interface ApiKeyRepository extends ScopedRepository {
  /**
   * Find an API key by its unique ID within the organization scope.
   */
  findById(id: ApiKeyId): Effect.Effect<ApiKey | null, RepositoryError>

  /**
   * Find all active (non-deleted) API keys for the organization.
   */
  findAll(): Effect.Effect<readonly ApiKey[], RepositoryError>

  /**
   * Save an API key (create or update) within the organization scope.
   */
  save(apiKey: ApiKey): Effect.Effect<void, RepositoryError>

  /**
   * Delete an API key by ID within the organization scope.
   */
  delete(id: ApiKeyId): Effect.Effect<void, RepositoryError>

  /**
   * Update the lastUsedAt timestamp for an API key within the organization scope.
   */
  touch(id: ApiKeyId): Effect.Effect<void, RepositoryError>
}
