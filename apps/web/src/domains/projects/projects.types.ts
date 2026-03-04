import { z } from "zod"

export interface ProjectRecord {
  readonly id: string
  readonly organizationId: string
  readonly name: string
  readonly slug: string
  readonly description: string | null
  readonly deletedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export const createProjectInputSchema = z.object({
  organizationId: z.string(),
  name: z.string(),
  description: z.string().optional(),
})

type CreateProjectInput = z.infer<typeof createProjectInputSchema>

export const updateProjectInputSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
})

type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>

export const deleteProjectInputSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
})

type DeleteProjectInput = z.infer<typeof deleteProjectInputSchema>

export const listProjectsInputSchema = z.object({
  organizationId: z.string(),
})

type ListProjectsInput = z.infer<typeof listProjectsInputSchema>
