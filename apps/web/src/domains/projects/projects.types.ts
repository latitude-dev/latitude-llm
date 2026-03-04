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
  name: z.string(),
  description: z.string().optional(),
})

export const updateProjectInputSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
})

export const deleteProjectInputSchema = z.object({
  id: z.string(),
})

export const listProjectsInputSchema = z.object({})
