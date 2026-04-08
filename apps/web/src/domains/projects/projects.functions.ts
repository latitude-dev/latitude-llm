import type { Project } from "@domain/projects"
import { createProjectUseCase, ProjectRepository, updateProjectUseCase } from "@domain/projects"
import { isValidId, ProjectId } from "@domain/shared"
import { ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

const toRecord = (project: Project) => ({
  id: project.id,
  organizationId: project.organizationId,
  name: project.name,
  slug: project.slug,
  settings: {
    keepMonitoring: project.settings?.keepMonitoring,
  },
  deletedAt: project.deletedAt ? project.deletedAt.toISOString() : null,
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
})

export type ProjectRecord = ReturnType<typeof toRecord>

export const listProjects = createServerFn({ method: "GET" }).handler(async (): Promise<ProjectRecord[]> => {
  const { organizationId } = await requireSession()
  const client = getPostgresClient()

  const projects = await Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* ProjectRepository
      return yield* repo.list()
    }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId)),
  )

  return projects.map(toRecord)
})

export const getProjectBySlug = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string() }))
  .handler(async ({ data }): Promise<ProjectRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const project = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.findBySlug(data.slug)
      }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId)),
    )

    return toRecord(project)
  })

export const createProject = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z
        .string()
        .optional()
        .refine((value) => value === undefined || isValidId(value), {
          message: "Invalid project id",
        }),
      name: z.string(),
    }),
  )
  .handler(async ({ data }): Promise<ProjectRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const project = await Effect.runPromise(
      createProjectUseCase({
        ...(data.id ? { id: ProjectId(data.id) } : {}),
        name: data.name,
      }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId)),
    )

    return toRecord(project)
  })

const projectSettingsSchema = z.object({
  keepMonitoring: z.boolean().optional(),
})

export const updateProject = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      settings: projectSettingsSchema.optional(),
    }),
  )
  .handler(async ({ data }): Promise<ProjectRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const project = await Effect.runPromise(
      updateProjectUseCase({ id: ProjectId(data.id), name: data.name, settings: data.settings }).pipe(
        withPostgres(ProjectRepositoryLive, client, organizationId),
      ),
    )

    return toRecord(project)
  })

export const deleteProject = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.softDelete(ProjectId(data.id))
      }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId)),
    )
  })
