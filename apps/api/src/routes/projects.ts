import { type CreateProjectInput, type Project, createProjectUseCase } from "@domain/projects"
import { OrganizationId, ProjectId, generateId } from "@domain/shared-kernel"
import { createProjectPostgresRepository } from "@platform/db-postgres"
import { Effect } from "effect"
import { Hono } from "hono"
import { BadRequestError } from "../errors.ts"
import { extractParam } from "../lib/effect-utils.ts"
import type { AuthContext } from "../types.ts"

/**
 * Project routes
 *
 * - POST /organizations/:organizationId/projects - Create project
 * - GET /organizations/:organizationId/projects - List projects
 * - GET /organizations/:organizationId/projects/:id - Get project
 * - PATCH /organizations/:organizationId/projects/:id - Update project
 * - DELETE /organizations/:organizationId/projects/:id - Soft delete project
 */

export const createProjectsRoutes = () => {
  const app = new Hono()

  // POST /organizations/:organizationId/projects - Create project
  app.post("/", async (c) => {
    const projectRepository = createProjectPostgresRepository(c.get("db"))
    const organizationId = extractParam(c, "organizationId", OrganizationId)
    if (!organizationId) {
      throw new BadRequestError({ httpMessage: "Organization ID is required" })
    }

    const auth = c.get("auth") as AuthContext

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
      createdById: auth.userId,
    }

    const project = await Effect.runPromise(createProjectUseCase(projectRepository)(input))
    return c.json(project, 201)
  })

  // GET /organizations/:organizationId/projects - List projects
  app.get("/", async (c) => {
    const projectRepository = createProjectPostgresRepository(c.get("db"))
    const organizationId = extractParam(c, "organizationId", OrganizationId)
    if (!organizationId) {
      throw new BadRequestError({ httpMessage: "Organization ID is required" })
    }

    const projects = await Effect.runPromise(projectRepository.findByOrganizationId(organizationId))
    return c.json({ projects }, 200)
  })

  // GET /organizations/:organizationId/projects/:id - Get project
  app.get("/:id", async (c) => {
    const projectRepository = createProjectPostgresRepository(c.get("db"))
    const organizationId = extractParam(c, "organizationId", OrganizationId)
    const id = extractParam(c, "id", ProjectId)
    if (!organizationId || !id) {
      throw new BadRequestError({
        httpMessage: "Organization ID and Project ID are required",
      })
    }

    const project = await Effect.runPromise(projectRepository.findById(id, organizationId))

    if (!project) {
      throw new BadRequestError({ httpMessage: "Project not found" })
    }

    return c.json(project, 200)
  })

  // PATCH /organizations/:organizationId/projects/:id - Update project
  app.patch("/:id", async (c) => {
    const projectRepository = createProjectPostgresRepository(c.get("db"))
    const organizationId = extractParam(c, "organizationId", OrganizationId)
    const id = extractParam(c, "id", ProjectId)
    if (!organizationId || !id) {
      throw new BadRequestError({
        httpMessage: "Organization ID and Project ID are required",
      })
    }

    const body = (await c.req.json()) as {
      readonly name?: string
      readonly description?: string | null
    }

    // First, find the existing project
    const existingProject = await Effect.runPromise(projectRepository.findById(id, organizationId))

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

    await Effect.runPromise(projectRepository.save(updatedProject))
    return c.json(updatedProject, 200)
  })

  // DELETE /organizations/:organizationId/projects/:id - Soft delete project
  app.delete("/:id", async (c) => {
    const projectRepository = createProjectPostgresRepository(c.get("db"))
    const organizationId = extractParam(c, "organizationId", OrganizationId)
    const id = extractParam(c, "id", ProjectId)
    if (!organizationId || !id) {
      throw new BadRequestError({
        httpMessage: "Organization ID and Project ID are required",
      })
    }

    await Effect.runPromise(projectRepository.softDelete(id, organizationId))
    return c.body(null, 204)
  })

  return app
}
