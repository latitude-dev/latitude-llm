import {
  type CreateProjectInput,
  createProjectUseCase,
  type Project,
  ProjectRepository,
  updateProjectUseCase,
} from "@domain/projects"
import { ProjectId } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { Effect } from "effect"
import { ErrorSchema, OrgAndIdParamsSchema, OrgParamsSchema, PROTECTED_SECURITY } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const ProjectSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    createdById: z.string().nullable(),
    deletedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Project")

const CreateProjectBodySchema = z
  .object({
    name: z.string().min(1).openapi({ description: "Project name" }),
    description: z.string().optional().openapi({ description: "Project description" }),
  })
  .openapi("CreateProjectBody")

const UpdateProjectBodySchema = z
  .object({
    name: z.string().min(1).optional().openapi({ description: "New project name" }),
    description: z
      .string()
      .nullable()
      .optional()
      .openapi({ description: "New project description; send null to clear" }),
  })
  .openapi("UpdateProjectBody")

/** Serialize a Project domain object to match the API response schema. */
const toProjectResponse = (project: Project) => ({
  id: project.id as string,
  organizationId: project.organizationId as string,
  name: project.name,
  slug: project.slug,
  description: project.description,
  createdById: (project.createdById as string | null) ?? null,
  deletedAt: project.deletedAt ? project.deletedAt.toISOString() : null,
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
})

const createProjectRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Projects"],
  summary: "Create project",
  description: "Creates a new project within the organization.",
  security: PROTECTED_SECURITY,
  request: {
    params: OrgParamsSchema,
    body: {
      content: { "application/json": { schema: CreateProjectBodySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: ProjectSchema } },
      description: "Project created successfully",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Validation error",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unauthorized",
    },
  },
})

const listProjectsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Projects"],
  summary: "List projects",
  description: "Returns all projects in the organization.",
  security: PROTECTED_SECURITY,
  request: {
    params: OrgParamsSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ projects: z.array(ProjectSchema) }).openapi("ProjectList"),
        },
      },
      description: "List of projects",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unauthorized",
    },
  },
})

const getProjectRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Projects"],
  summary: "Get project",
  description: "Returns a single project by ID.",
  security: PROTECTED_SECURITY,
  request: {
    params: OrgAndIdParamsSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: ProjectSchema } },
      description: "Project details",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unauthorized",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Project not found",
    },
  },
})

const updateProjectRoute = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Projects"],
  summary: "Update project",
  description: "Updates a project's name and/or description.",
  security: PROTECTED_SECURITY,
  request: {
    params: OrgAndIdParamsSchema,
    body: {
      content: { "application/json": { schema: UpdateProjectBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ProjectSchema } },
      description: "Updated project",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Validation error",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unauthorized",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Project not found",
    },
  },
})

const deleteProjectRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Projects"],
  summary: "Delete project",
  description: "Soft-deletes a project by ID.",
  security: PROTECTED_SECURITY,
  request: {
    params: OrgAndIdParamsSchema,
  },
  responses: {
    204: {
      description: "Project deleted successfully",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unauthorized",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Project not found",
    },
  },
})

export const createProjectsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>({
    defaultHook(result, c) {
      if (!result.success) {
        const error = result.error.issues.map((i) => i.message).join(", ")
        return c.json({ error }, 400)
      }
    },
  })

  app.openapi(createProjectRoute, async (c) => {
    const auth = c.var.auth
    const body = c.req.valid("json")

    const input: CreateProjectInput = {
      name: body.name,
      ...(body.description !== undefined && { description: body.description }),
      createdById: auth.userId,
    }

    const project = await Effect.runPromise(
      createProjectUseCase(input).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, c.var.organization.id),
      ),
    )
    return c.json(toProjectResponse(project), 201)
  })

  app.openapi(listProjectsRoute, async (c) => {
    const projects = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.findAll()
      }).pipe(withPostgres(ProjectRepositoryLive, c.var.postgresClient, c.var.organization.id)),
    )

    return c.json({ projects: projects.map(toProjectResponse) }, 200)
  })

  app.openapi(getProjectRoute, async (c) => {
    const { id: idParam } = c.req.valid("param")
    const id = ProjectId(idParam)

    const project = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.findById(id)
      }).pipe(withPostgres(ProjectRepositoryLive, c.var.postgresClient, c.var.organization.id)),
    )

    return c.json(toProjectResponse(project), 200)
  })

  app.openapi(updateProjectRoute, async (c) => {
    const { id: idParam } = c.req.valid("param")
    const id = ProjectId(idParam)
    const body = c.req.valid("json")

    const updatedProject = await Effect.runPromise(
      updateProjectUseCase({
        id,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      }).pipe(withPostgres(ProjectRepositoryLive, c.var.postgresClient, c.var.organization.id)),
    )

    return c.json(toProjectResponse(updatedProject), 200)
  })

  app.openapi(deleteProjectRoute, async (c) => {
    const { id: idParam } = c.req.valid("param")
    const id = ProjectId(idParam)

    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.softDelete(id)
      }).pipe(withPostgres(ProjectRepositoryLive, c.var.postgresClient, c.var.organization.id)),
    )
    return c.body(null, 204)
  })

  return app
}
