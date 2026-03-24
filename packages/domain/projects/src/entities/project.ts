import { generateId, type OrganizationId, ProjectId, type ProjectSettings } from "@domain/shared"

export interface Project {
  readonly id: ProjectId
  readonly organizationId: OrganizationId
  readonly name: string
  readonly slug: string
  readonly settings: ProjectSettings | null
  readonly deletedAt: Date | null
  readonly lastEditedAt: Date
  readonly createdAt: Date
  readonly updatedAt: Date
}

export const createProject = (params: {
  id?: ProjectId | undefined
  organizationId: OrganizationId
  name: string
  slug: string
  settings?: ProjectSettings | null
  deletedAt?: Date
  lastEditedAt?: Date
  createdAt?: Date
  updatedAt?: Date
}): Project => {
  const now = new Date()
  return {
    id: params.id ?? ProjectId(generateId()),
    organizationId: params.organizationId,
    name: params.name,
    slug: params.slug,
    settings: params.settings ?? null,
    deletedAt: params.deletedAt ?? null,
    lastEditedAt: params.lastEditedAt ?? now,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  }
}

/**
 * Check if a project is soft deleted.
 */
export const isProjectDeleted = (project: Project): boolean => {
  return project.deletedAt !== null
}

/**
 * Mark a project as deleted (soft delete).
 */
export const markProjectDeleted = (project: Project): Project => {
  const now = new Date()
  return {
    ...project,
    deletedAt: now,
    lastEditedAt: now,
    updatedAt: now,
  }
}

/**
 * Restore a soft-deleted project.
 */
export const restoreProject = (project: Project): Project => {
  const now = new Date()
  return {
    ...project,
    deletedAt: null,
    lastEditedAt: now,
    updatedAt: now,
  }
}
