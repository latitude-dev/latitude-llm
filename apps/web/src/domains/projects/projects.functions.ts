import { createProjectUseCase, updateProjectUseCase } from "@domain/projects"
import type { Project } from "@domain/projects"
import { OrganizationId, ProjectId, UserId, generateId } from "@domain/shared"
import { createProjectPostgresRepository, runCommand } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { zodValidator } from "@tanstack/zod-adapter"
import { Effect } from "effect"
import { assertOrganizationMembership, requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"
import {
  type ProjectRecord,
  createProjectInputSchema,
  deleteProjectInputSchema,
  listProjectsInputSchema,
  updateProjectInputSchema,
} from "./projects.types.ts"

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
  .inputValidator(zodValidator(listProjectsInputSchema))
  .handler(async ({ data }): Promise<ProjectRecord[]> => {
    const { userId } = await requireSession()
    await assertOrganizationMembership(data.organizationId, userId)
    const { db } = getPostgresClient()

    const projects = await runCommand(
      db,
      data.organizationId,
    )(async (txDb) => {
      const projectsRepo = createProjectPostgresRepository(txDb)
      return Effect.runPromise(projectsRepo.findByOrganizationId(OrganizationId(data.organizationId)))
    })

    return projects.map(toRecord)
  })

export const createProject = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(createProjectInputSchema))
  .handler(async ({ data }): Promise<ProjectRecord> => {
    const { userId } = await requireSession()
    await assertOrganizationMembership(data.organizationId, userId)
    const { db } = getPostgresClient()

    const project = await runCommand(
      db,
      data.organizationId,
    )(async (txDb) => {
      const projectsRepo = createProjectPostgresRepository(txDb)

      return Effect.runPromise(
        createProjectUseCase(projectsRepo)({
          id: ProjectId(generateId()),
          organizationId: OrganizationId(data.organizationId),
          name: data.name,
          ...(data.description !== undefined ? { description: data.description } : {}),
          createdById: UserId(userId),
        }),
      )
    })

    return toRecord(project)
  })

export const updateProject = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(updateProjectInputSchema))
  .handler(async ({ data }): Promise<ProjectRecord> => {
    const { userId } = await requireSession()
    await assertOrganizationMembership(data.organizationId, userId)
    const { db } = getPostgresClient()

    const updatedProject = await runCommand(
      db,
      data.organizationId,
    )(async (txDb) => {
      const projectsRepo = createProjectPostgresRepository(txDb)

      return Effect.runPromise(
        updateProjectUseCase(projectsRepo)({
          id: ProjectId(data.id),
          organizationId: OrganizationId(data.organizationId),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
        }),
      )
    })

    return toRecord(updatedProject)
  })

export const deleteProject = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(deleteProjectInputSchema))
  .handler(async ({ data }): Promise<void> => {
    const { userId } = await requireSession()
    await assertOrganizationMembership(data.organizationId, userId)
    const { db } = getPostgresClient()

    await runCommand(
      db,
      data.organizationId,
    )(async (txDb) => {
      const projectsRepo = createProjectPostgresRepository(txDb)

      return Effect.runPromise(projectsRepo.softDelete(ProjectId(data.id), OrganizationId(data.organizationId)))
    })
  })
