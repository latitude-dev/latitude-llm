import { type CreateProjectInput, createProjectUseCase, updateProjectUseCase } from "@domain/projects"
import { BadRequestError, ProjectId, generateId } from "@domain/shared"
import { createProjectPostgresRepository, runCommand } from "@platform/db-postgres"
import { Effect } from "effect"
import { Hono } from "hono"
import type { OrganizationScopedEnv } from "../types.ts"

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
  const app = new Hono<OrganizationScopedEnv>()

  // POST /organizations/:organizationId/projects - Create project
  app.post("/", async (c) => {
    const organizationId = c.var.organization.id
    const auth = c.var.auth
    const body = (await c.req.json()) as {
      readonly name: string
      readonly description?: string
    }

    const input: CreateProjectInput = {
      id: ProjectId(generateId()),
      organizationId,
      name: body.name,
      ...(body.description !== undefined && { description: body.description }),
      createdById: auth.userId,
    }

    const project = await runCommand(
      c.var.db,
      organizationId,
    )(async (txDb) => {
      const projectRepository = createProjectPostgresRepository(txDb, organizationId)

      return Effect.runPromise(createProjectUseCase(projectRepository)(input))
    })
    return c.json(project, 201)
  })

  // GET /organizations/:organizationId/projects - List projects
  app.get("/", async (c) => {
    const organizationId = c.var.organization.id

    const projects = await runCommand(
      c.var.db,
      organizationId,
    )(async (txDb) => {
      const scopedRepo = createProjectPostgresRepository(txDb, organizationId)
      return Effect.runPromise(scopedRepo.findAll())
    })
    return c.json({ projects }, 200)
  })

  // GET /organizations/:organizationId/projects/:id - Get project
  app.get("/:id", async (c) => {
    const organizationId = c.var.organization.id
    const idParam = c.req.param("id")
    const id = idParam ? ProjectId(idParam) : null
    if (!id) {
      throw new BadRequestError({
        httpMessage: "Project ID is required",
      })
    }

    const project = await runCommand(
      c.var.db,
      organizationId,
    )(async (txDb) => {
      const projectRepository = createProjectPostgresRepository(txDb, organizationId)
      return Effect.runPromise(projectRepository.findById(id))
    })

    if (!project) {
      throw new BadRequestError({ httpMessage: "Project not found" })
    }

    return c.json(project, 200)
  })

  // PATCH /organizations/:organizationId/projects/:id - Update project
  app.patch("/:id", async (c) => {
    const organizationId = c.var.organization.id
    const idParam = c.req.param("id")
    const id = idParam ? ProjectId(idParam) : null
    if (!id) {
      throw new BadRequestError({
        httpMessage: "Project ID is required",
      })
    }

    const body = (await c.req.json()) as {
      readonly name?: string
      readonly description?: string | null
    }

    const updatedProject = await runCommand(
      c.var.db,
      organizationId,
    )(async (txDb) => {
      const projectRepository = createProjectPostgresRepository(txDb, organizationId)

      return Effect.runPromise(
        updateProjectUseCase(projectRepository)({
          id,
          organizationId,
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
        }),
      )
    })

    return c.json(updatedProject, 200)
  })

  // DELETE /organizations/:organizationId/projects/:id - Soft delete project
  app.delete("/:id", async (c) => {
    const organizationId = c.var.organization.id
    const idParam = c.req.param("id")
    const id = idParam ? ProjectId(idParam) : null
    if (!id) {
      throw new BadRequestError({
        httpMessage: "Project ID is required",
      })
    }

    await runCommand(
      c.var.db,
      organizationId,
    )(async (txDb) => {
      const projectRepository = createProjectPostgresRepository(txDb, organizationId)

      return Effect.runPromise(projectRepository.softDelete(id))
    })
    return c.body(null, 204)
  })

  return app
}
