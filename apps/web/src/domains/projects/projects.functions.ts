import { createProjectUseCase, listProjectsUseCase } from "@domain/projects"
import type { Project } from "@domain/projects"
import { NotFoundError, OrganizationId, ProjectId, UserId, generateId } from "@domain/shared-kernel"
import { createRepositories } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { assertOrganizationMembership, requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"
import type {
  CreateProjectInput,
  DeleteProjectInput,
  ListProjectsInput,
  ProjectRecord,
  UpdateProjectInput,
} from "./projects.types.ts"

const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

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
  .inputValidator((data: ListProjectsInput) => data)
  .handler(async ({ data }): Promise<ProjectRecord[]> => {
    const { userId } = await requireSession()
    await assertOrganizationMembership(data.organizationId, userId)
    const { db } = getPostgresClient()
    const repos = createRepositories(db)

    const projects = (await Effect.runPromise(
      listProjectsUseCase(repos.project)({
        organizationId: OrganizationId(data.organizationId),
      }),
    )) as readonly Project[]

    return projects.map(toRecord)
  })

export const createProject = createServerFn({ method: "POST" })
  .inputValidator((data: CreateProjectInput) => data)
  .handler(async ({ data }): Promise<ProjectRecord> => {
    const { userId } = await requireSession()
    await assertOrganizationMembership(data.organizationId, userId)
    const { db } = getPostgresClient()
    const repos = createRepositories(db)

    const project = (await Effect.runPromise(
      createProjectUseCase(repos.project)({
        id: ProjectId(generateId()),
        organizationId: OrganizationId(data.organizationId),
        name: data.name,
        slug: toSlug(data.name),
        ...(data.description !== undefined ? { description: data.description } : {}),
        createdById: UserId(userId),
      }),
    )) as Project

    return toRecord(project)
  })

export const updateProject = createServerFn({ method: "POST" })
  .inputValidator((data: UpdateProjectInput) => data)
  .handler(async ({ data }): Promise<ProjectRecord> => {
    const { userId } = await requireSession()
    await assertOrganizationMembership(data.organizationId, userId)
    const { db } = getPostgresClient()
    const repos = createRepositories(db)

    const updatedProject = (await Effect.runPromise(
      Effect.gen(function* () {
        const existingProject = (yield* repos.project.findById(
          ProjectId(data.id),
          OrganizationId(data.organizationId),
        )) as Project | null

        if (!existingProject) {
          return yield* new NotFoundError({ entity: "Project", id: data.id })
        }

        const projectToSave: Project = {
          ...existingProject,
          name: data.name !== undefined ? data.name : existingProject.name,
          slug: data.name !== undefined ? toSlug(data.name) : existingProject.slug,
          description: data.description !== undefined ? data.description : existingProject.description,
          updatedAt: new Date(),
        }

        yield* repos.project.save(projectToSave)

        return projectToSave
      }),
    )) as Project

    return toRecord(updatedProject)
  })

export const deleteProject = createServerFn({ method: "POST" })
  .inputValidator((data: DeleteProjectInput) => data)
  .handler(async ({ data }): Promise<void> => {
    const { userId } = await requireSession()
    await assertOrganizationMembership(data.organizationId, userId)
    const { db } = getPostgresClient()
    const repos = createRepositories(db)

    await Effect.runPromise(repos.project.softDelete(ProjectId(data.id), OrganizationId(data.organizationId)))
  })
