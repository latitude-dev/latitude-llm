import type { OrganizationId, ProjectId, RepositoryError } from "@domain/shared-kernel";
import type { Effect } from "effect";
import type { Project } from "../entities/project.js";

/**
 * Repository port for Project entities.
 *
 * This interface defines the contract for project persistence operations.
 * All methods are RLS-aware - they operate within the context of an organization.
 * Implementations are provided in the platform layer (e.g., Postgres adapter).
 */
export interface ProjectRepository {
  /**
   * Find a project by its unique ID.
   * Returns null if not found or if project belongs to a different organization.
   */
  findById(
    id: ProjectId,
    organizationId: OrganizationId,
  ): Effect.Effect<Project | null, RepositoryError>;

  /**
   * Find all projects in an organization (excluding soft-deleted ones).
   */
  findByOrganizationId(
    organizationId: OrganizationId,
  ): Effect.Effect<readonly Project[], RepositoryError>;

  /**
   * Find all projects in an organization including soft-deleted ones.
   */
  findAllByOrganizationIdIncludingDeleted(
    organizationId: OrganizationId,
  ): Effect.Effect<readonly Project[], RepositoryError>;

  /**
   * Save a project (create or update).
   */
  save(project: Project): Effect.Effect<void, RepositoryError>;

  /**
   * Soft delete a project by ID.
   * Sets deletedAt to current timestamp.
   */
  softDelete(id: ProjectId, organizationId: OrganizationId): Effect.Effect<void, RepositoryError>;

  /**
   * Hard delete a project by ID (permanent removal).
   * Use with caution - prefer softDelete for user-facing operations.
   */
  hardDelete(id: ProjectId, organizationId: OrganizationId): Effect.Effect<void, RepositoryError>;

  /**
   * Check if a project exists with the given name in the organization.
   */
  existsByName(
    name: string,
    organizationId: OrganizationId,
  ): Effect.Effect<boolean, RepositoryError>;

  /**
   * Check if a project exists with the given slug in the organization.
   */
  existsBySlug(
    slug: string,
    organizationId: OrganizationId,
  ): Effect.Effect<boolean, RepositoryError>;
}
