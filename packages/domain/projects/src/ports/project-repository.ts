import type { ProjectId, RepositoryError, ScopedRepository } from "@domain/shared"
import type { Effect } from "effect"
import type { Project } from "../entities/project.ts"

/**
 * Repository port for Project entities.
 *
 * This interface defines the contract for project persistence operations.
 * All methods are RLS-aware - they operate within the context of an organization.
 * Implementations are provided in the platform layer (e.g., Postgres adapter).
 */
export interface ProjectRepository extends ScopedRepository {
  /**
   * Find a project by its unique ID.
   * Returns null if not found or if project belongs to a different organization.
   */
  findById(id: ProjectId): Effect.Effect<Project | null, RepositoryError>

  /**
   * Find all projects in an organization (excluding soft-deleted ones).
   */
  findAll(): Effect.Effect<readonly Project[], RepositoryError>

  /**
   * Find all projects in an organization including soft-deleted ones.
   */
  findAllIncludingDeleted(): Effect.Effect<readonly Project[], RepositoryError>

  /**
   * Save a project (create or update).
   */
  save(project: Project): Effect.Effect<void, RepositoryError>

  /**
   * Soft delete a project by ID.
   * Sets deletedAt to current timestamp.
   */
  softDelete(id: ProjectId): Effect.Effect<void, RepositoryError>

  /**
   * Hard delete a project by ID (permanent removal).
   * Use with caution - prefer softDelete for user-facing operations.
   */
  hardDelete(id: ProjectId): Effect.Effect<void, RepositoryError>

  /**
   * Check if a project exists with the given name in the organization.
   */
  existsByName(name: string): Effect.Effect<boolean, RepositoryError>

  /**
   * Check if a project exists with the given slug in the organization.
   */
  existsBySlug(slug: string): Effect.Effect<boolean, RepositoryError>
}
