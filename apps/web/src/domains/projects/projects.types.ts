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

export const updateProjectInputSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
})

export const deleteProjectInputSchema = z.object({
  organizationId: z.string(),
  id: z.string(),
})

export const listProjectsInputSchema = z.object({
  organizationId: z.string(),
})
