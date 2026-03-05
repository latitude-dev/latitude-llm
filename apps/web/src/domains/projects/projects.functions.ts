import { createProjectUseCase, updateProjectUseCase } from "@domain/projects"
import type { Project } from "@domain/projects"
import { OrganizationId, ProjectId, UserId, generateId } from "@domain/shared"
import { createProjectPostgresRepository, runCommand } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { zodValidator } from "@tanstack/zod-adapter"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"

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

const toRecord = (project: Project): ProjectRecord => ({
  id: project.id,
  organizationId: project.organizationId,
  name: project.name,
  slug: project.slug,
  description: project.description,
  deletedAt: project.deletedAt ? project.deletedAt.toISOString() : null,
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
})

export const listProjects = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .handler(async (): Promise<ProjectRecord[]> => {
    const { organizationId } = await requireSession()
    const { db } = getPostgresClient()

    const projects = await runCommand(
      db,
      organizationId,
    )(async (txDb) => {
      const projectsRepo = createProjectPostgresRepository(txDb, OrganizationId(organizationId))
      return Effect.runPromise(projectsRepo.findAll())
    })

    return projects.map(toRecord)
  })

export const createProject = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(zodValidator(z.object({ name: z.string(), description: z.string().optional() })))
  .handler(async ({ data }): Promise<ProjectRecord> => {
    const { userId, organizationId } = await requireSession()
    const { db } = getPostgresClient()

    const project = await runCommand(
      db,
      organizationId,
    )(async (txDb) => {
      const projectsRepo = createProjectPostgresRepository(txDb, OrganizationId(organizationId))

      return Effect.runPromise(
        createProjectUseCase(projectsRepo)({
          id: ProjectId(generateId()),
          organizationId: OrganizationId(organizationId),
          name: data.name,
          ...(data.description !== undefined ? { description: data.description } : {}),
          createdById: UserId(userId),
        }),
      )
    })

    return toRecord(project)
  })

export const updateProject = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(
    zodValidator(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().nullable().optional(),
      }),
    ),
  )
  .handler(async ({ data }): Promise<ProjectRecord> => {
    const { organizationId } = await requireSession()
    const { db } = getPostgresClient()

    const updatedProject = await runCommand(
      db,
      organizationId,
    )(async (txDb) => {
      const projectsRepo = createProjectPostgresRepository(txDb, OrganizationId(organizationId))

      return Effect.runPromise(
        updateProjectUseCase(projectsRepo)({
          id: ProjectId(data.id),
          organizationId: OrganizationId(organizationId),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
        }),
      )
    })

    return toRecord(updatedProject)
  })

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(zodValidator(z.object({ id: z.string() })))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSession()
    const { db } = getPostgresClient()

    await runCommand(
      db,
      organizationId,
    )(async (txDb) => {
      const projectsRepo = createProjectPostgresRepository(txDb, OrganizationId(organizationId))

      return Effect.runPromise(projectsRepo.softDelete(ProjectId(data.id)))
    })
  })
