import { type CreateProjectInput, type Project, createProjectUseCase, listProjectsUseCase } from "@domain/projects"
import { OrganizationId, ProjectId, UserId, generateId } from "@domain/shared-kernel"
import { createRepositories } from "@platform/db-postgres"
import { Effect } from "effect"
import { Hono } from "hono"
import { getPostgresClient } from "../clients.ts"
import { BadRequestError } from "../errors.ts"
import { extractParam } from "../lib/effect-utils.ts"

/**
 * Project routes
 *
 * - POST /organizations/:organizationId/projects - Create project
 * - GET /organizations/:organizationId/projects - List projects
 * - GET /organizations/:organizationId/projects/:id - Get project
 * - PATCH /organizations/:organizationId/projects/:id - Update project
 * - DELETE /organizations/:organizationId/projects/:id - Soft delete project
 */

// Placeholder for getting current user ID - in production, get from auth context
const getCurrentUserId = () => "user-id-placeholder"

export const createProjectsRoutes = () => {
  const repos = createRepositories(getPostgresClient().db)
  const app = new Hono()

  // POST /organizations/:organizationId/projects - Create project
  app.post("/", async (c) => {
    const organizationId = extractParam(c, "organizationId", OrganizationId)
    if (!organizationId) {
      throw new BadRequestError({ httpMessage: "Organization ID is required" })
    }

    const body = (await c.req.json()) as {
      readonly name: string
      readonly description?: string
    }

    // Generate slug from name
    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")

    const input: CreateProjectInput = {
      id: ProjectId(generateId()),
      organizationId,
      name: body.name,
      slug,
      ...(body.description !== undefined && { description: body.description }),
      createdById: UserId(getCurrentUserId()),
    }

    const project = await Effect.runPromise(createProjectUseCase(repos.project)(input))
    return c.json(project, 201)
  })

  // GET /organizations/:organizationId/projects - List projects
  app.get("/", async (c) => {
    const organizationId = extractParam(c, "organizationId", OrganizationId)
    if (!organizationId) {
      throw new BadRequestError({ httpMessage: "Organization ID is required" })
    }

    const projects = await Effect.runPromise(listProjectsUseCase(repos.project)({ organizationId }))
    return c.json({ projects }, 200)
  })

  // GET /organizations/:organizationId/projects/:id - Get project
  app.get("/:id", async (c) => {
    const organizationId = extractParam(c, "organizationId", OrganizationId)
    const id = extractParam(c, "id", ProjectId)
    if (!organizationId || !id) {
      throw new BadRequestError({ httpMessage: "Organization ID and Project ID are required" })
    }

    const project = await Effect.runPromise(repos.project.findById(id, organizationId))

    if (!project) {
      throw new BadRequestError({ httpMessage: "Project not found" })
    }

    return c.json(project, 200)
  })

  // PATCH /organizations/:organizationId/projects/:id - Update project
  app.patch("/:id", async (c) => {
    const organizationId = extractParam(c, "organizationId", OrganizationId)
    const id = extractParam(c, "id", ProjectId)
    if (!organizationId || !id) {
      throw new BadRequestError({ httpMessage: "Organization ID and Project ID are required" })
    }

    const body = (await c.req.json()) as {
      readonly name?: string
      readonly description?: string | null
    }

    // First, find the existing project
    const existingProject = await Effect.runPromise(repos.project.findById(id, organizationId))

    if (!existingProject) {
      throw new BadRequestError({ httpMessage: "Project not found" })
    }

    // Apply updates
    const updatedProject: Project = {
      ...existingProject,
      name: body.name !== undefined ? body.name : existingProject.name,
      description: body.description !== undefined ? body.description : existingProject.description,
      updatedAt: new Date(),
    }

    await Effect.runPromise(repos.project.save(updatedProject))
    return c.json(updatedProject, 200)
  })

  // DELETE /organizations/:organizationId/projects/:id - Soft delete project
  app.delete("/:id", async (c) => {
    const organizationId = extractParam(c, "organizationId", OrganizationId)
    const id = extractParam(c, "id", ProjectId)
    if (!organizationId || !id) {
      throw new BadRequestError({ httpMessage: "Organization ID and Project ID are required" })
    }

    await Effect.runPromise(repos.project.softDelete(id, organizationId))
    return c.body(null, 204)
  })

  return app
}
