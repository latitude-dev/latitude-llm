import {
  generateId,
  organizationIdSchema,
  type OrganizationId,
  projectIdSchema,
  type ProjectId,
  projectSettingsSchema,
  type ProjectSettings,
} from "@domain/shared"
import { z } from "zod"

export const projectSchema = z.object({
  id: projectIdSchema,
  organizationId: organizationIdSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  settings: projectSettingsSchema.nullable(),
  deletedAt: z.date().nullable(),
  lastEditedAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Project = z.infer<typeof projectSchema>

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
  return projectSchema.parse({
    id: params.id ?? generateId<"ProjectId">(),
    organizationId: params.organizationId,
    name: params.name,
    slug: params.slug,
    settings: params.settings ?? null,
    deletedAt: params.deletedAt ?? null,
    lastEditedAt: params.lastEditedAt ?? now,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  })
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
  return projectSchema.parse({
    ...project,
    deletedAt: now,
    lastEditedAt: now,
    updatedAt: now,
  })
}

/**
 * Restore a soft-deleted project.
 */
export const restoreProject = (project: Project): Project => {
  const now = new Date()
  return projectSchema.parse({
    ...project,
    deletedAt: null,
    lastEditedAt: now,
    updatedAt: now,
  })
}
