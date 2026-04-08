import {
  type CreateProjectInput,
  createProjectUseCase,
  type Project,
  ProjectRepository,
  updateProjectUseCase,
} from "@domain/projects"
import { ProjectId } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { OutboxEventWriterLive, ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { Effect, Layer } from "effect"
import {
  errorResponse,
  jsonBody,
  jsonResponse,
  OrgAndIdParamsSchema,
  OrgParamsSchema,
  openApiNoContentResponses,
  openApiResponses,
  PROTECTED_SECURITY,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const ResponseSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    name: z.string(),
    slug: z.string(),
    deletedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Project")

const ListResponseSchema = z.object({ projects: z.array(ResponseSchema) }).openapi("ProjectList")

const CreateRequestSchema = z
  .object({
    name: z.string().min(1).openapi({ description: "Project name" }),
  })
  .openapi("CreateProjectBody")

const UpdateRequestSchema = z
  .object({
    name: z.string().min(1).optional().openapi({ description: "New project name" }),
  })
  .openapi("UpdateProjectBody")

const toResponse = (project: Project) => ({
  id: project.id as string,
  organizationId: project.organizationId as string,
  name: project.name,
  slug: project.slug,
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
    body: jsonBody(CreateRequestSchema),
  },
  responses: openApiResponses({ status: 201, schema: ResponseSchema, description: "Project created successfully" }),
})

const listProjectsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Projects"],
  summary: "List projects",
  description: "Returns all projects in the organization.",
  security: PROTECTED_SECURITY,
  request: { params: OrgParamsSchema },
  responses: {
    200: jsonResponse(ListResponseSchema, "List of projects"),
    401: errorResponse("Unauthorized"),
  },
})

const getProjectRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Projects"],
  summary: "Get project",
  description: "Returns a single project by ID.",
  security: PROTECTED_SECURITY,
  request: { params: OrgAndIdParamsSchema },
  responses: {
    200: jsonResponse(ResponseSchema, "Project details"),
    401: errorResponse("Unauthorized"),
    404: errorResponse("Project not found"),
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
    body: jsonBody(UpdateRequestSchema),
  },
  responses: openApiResponses({ status: 200, schema: ResponseSchema, description: "Updated project" }),
})

const deleteProjectRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Projects"],
  summary: "Delete project",
  description: "Soft-deletes a project by ID.",
  security: PROTECTED_SECURITY,
  request: { params: OrgAndIdParamsSchema },
  responses: openApiNoContentResponses({ description: "Project deleted successfully" }),
})

export const createProjectsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()

  app.openapi(createProjectRoute, async (c) => {
    const body = c.req.valid("json")

    const input: CreateProjectInput = {
      name: body.name,
    }

    const project = await Effect.runPromise(
      createProjectUseCase(input).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, OutboxEventWriterLive),
          c.var.postgresClient,
          c.var.organization.id,
        ),
      ),
    )
    return c.json(toResponse(project), 201)
  })

  app.openapi(listProjectsRoute, async (c) => {
    const projects = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.list()
      }).pipe(withPostgres(ProjectRepositoryLive, c.var.postgresClient, c.var.organization.id)),
    )

    return c.json({ projects: projects.map(toResponse) }, 200)
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

    return c.json(toResponse(project), 200)
  })

  app.openapi(updateProjectRoute, async (c) => {
    const { id: idParam } = c.req.valid("param")
    const id = ProjectId(idParam)
    const body = c.req.valid("json")

    const updatedProject = await Effect.runPromise(
      updateProjectUseCase({
        id,
        ...(body.name !== undefined ? { name: body.name } : {}),
      }).pipe(withPostgres(ProjectRepositoryLive, c.var.postgresClient, c.var.organization.id)),
    )

    return c.json(toResponse(updatedProject), 200)
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
