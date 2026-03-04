import type { OrganizationId } from "./id.ts"

/**
 * Base interface for repositories that are scoped to an organization.
 *
 * All organization-scoped repositories (projects, api_keys, grants, subscriptions, etc.)
 * should implement this interface to ensure consistent tenancy enforcement.
 *
 * The organizationId is set at repository creation time and used by all
 * repository methods to ensure data isolation.
 *
 * Example:
 * ```typescript
 * const repo = createProjectPostgresRepository(db, organizationId)
 * await repo.findById(projectId) // Automatically scoped to organizationId
 * ```
 */
export interface ScopedRepository {
  /**
   * The organization ID this repository is scoped to.
   * All operations are implicitly filtered to this organization.
   */
  readonly organizationId: OrganizationId
}

/**
 * Marker interface for repositories that are NOT scoped to an organization.
 *
 * Unscoped repositories are used for cross-tenant operations where the
 * organization context is not known upfront or operations span multiple organizations.
 *
 * These should be used sparingly and only for legitimate cross-tenant use cases:
 * - Authentication lookups (finding an entity by a unique identifier before org is known)
 * - Batch operations across organizations (e.g., background jobs)
 * - Seeding/migration operations
 *
 * Example:
 * ```typescript
 * const unscopedRepo = createUnscopedApiKeyPostgresRepository(db)
 * const key = await unscopedRepo.findByTokenHash(tokenHash) // Cross-org lookup
 * ```
 */
export interface UnscopedRepository {
  /**
   * Marker property to distinguish unscoped repositories.
   * This repository operates across all organizations.
   */
  readonly _tag: "UnscopedRepository"
}
