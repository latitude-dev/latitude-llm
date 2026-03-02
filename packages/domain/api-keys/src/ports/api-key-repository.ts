import type { ApiKeyId, OrganizationId, RepositoryError } from "@domain/shared-kernel";
import type { Effect } from "effect";
import type { ApiKey } from "../entities/api-key.ts";

/**
 * Repository port for API Key entities.
 *
 * This interface defines the contract for API key persistence operations.
 * Implementations are provided in the platform layer (e.g., Postgres adapter).
 */
export interface ApiKeyRepository {
  /**
   * Find an API key by its unique ID.
   */
  findById(id: ApiKeyId): Effect.Effect<ApiKey | null, RepositoryError>;

  /**
   * Find an API key by its token (for authentication).
   */
  findByToken(token: string): Effect.Effect<ApiKey | null, RepositoryError>;

  /**
   * Find all active (non-deleted) API keys for an organization.
   */
  findByOrganizationId(
    organizationId: OrganizationId,
  ): Effect.Effect<readonly ApiKey[], RepositoryError>;

  /**
   * Save an API key (create or update).
   */
  save(apiKey: ApiKey): Effect.Effect<void, RepositoryError>;

  /**
   * Delete an API key by ID (hard delete).
   */
  delete(id: ApiKeyId): Effect.Effect<void, RepositoryError>;

  /**
   * Update the lastUsedAt timestamp for an API key.
   */
  touch(id: ApiKeyId): Effect.Effect<void, RepositoryError>;
}
