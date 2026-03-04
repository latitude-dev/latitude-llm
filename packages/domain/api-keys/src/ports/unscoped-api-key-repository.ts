import type { ApiKeyId, RepositoryError, UnscopedRepository } from "@domain/shared"
import type { Effect } from "effect"
import type { ApiKey } from "../entities/api-key.ts"

/**
 * Unscoped repository for API Key entities.
 *
 * This repository performs cross-organization operations and should be used
 * sparingly for legitimate use cases where the organization context is not
 * known upfront or operations span multiple organizations.
 *
 * Use cases:
 * - Authentication lookups by token hash (before org is known)
 * - Batch touch operations across organizations (background jobs)
 * - Admin/migration operations
 *
 * For organization-scoped operations, use the standard ApiKeyRepository which
 * enforces RLS and data isolation.
 */
export interface UnscopedApiKeyRepository extends UnscopedRepository {
  /**
   * Find an API key by its token hash across all organizations.
   * Used during authentication when the organization is not yet known.
   */
  findByTokenHash(tokenHash: string): Effect.Effect<ApiKey | null, RepositoryError>

  /**
   * Update the lastUsedAt timestamp for multiple API keys in a batch.
   * This operates across all organizations for efficiency in background jobs.
   */
  touchBatch(ids: readonly ApiKeyId[]): Effect.Effect<void, RepositoryError>

  /**
   * Find all API keys across all organizations.
   * Use sparingly - primarily for admin/debugging.
   */
  findAll(): Effect.Effect<readonly ApiKey[], RepositoryError>

  /**
   * Check if any API key exists with the given token hash.
   */
  existsByTokenHash(tokenHash: string): Effect.Effect<boolean, RepositoryError>
}
