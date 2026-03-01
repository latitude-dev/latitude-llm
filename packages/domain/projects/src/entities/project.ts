import type { OrganizationId, ProjectId, UserId } from "@domain/shared-kernel";

/**
 * Project entity - represents a project within an organization.
 *
 * Projects are used to group related prompts, evaluations, and telemetry data.
 * They support soft deletion via the deletedAt field.
 */
export interface Project {
  readonly id: ProjectId;
  readonly organizationId: OrganizationId;
  readonly name: string;
  readonly description: string | null;
  readonly createdById: UserId | null;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Factory function to create a new Project.
 */
export const createProject = (params: {
  id: ProjectId;
  organizationId: OrganizationId;
  name: string;
  description?: string;
  createdById?: UserId;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}): Project => {
  const now = new Date();
  return {
    id: params.id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? null,
    createdById: params.createdById ?? null,
    deletedAt: params.deletedAt ?? null,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  };
};

/**
 * Check if a project is soft deleted.
 */
export const isProjectDeleted = (project: Project): boolean => {
  return project.deletedAt !== null;
};

/**
 * Mark a project as deleted (soft delete).
 */
export const markProjectDeleted = (project: Project): Project => {
  return {
    ...project,
    deletedAt: new Date(),
    updatedAt: new Date(),
  };
};

/**
 * Restore a soft-deleted project.
 */
export const restoreProject = (project: Project): Project => {
  return {
    ...project,
    deletedAt: null,
    updatedAt: new Date(),
  };
};
