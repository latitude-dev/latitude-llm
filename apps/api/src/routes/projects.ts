import {
  type CreateProjectInput,
  InvalidProjectNameError,
  type Project,
  ProjectAlreadyExistsError,
  createProjectUseCase,
  listProjectsUseCase,
} from "@domain/projects";
import {
  NotFoundError,
  OrganizationId,
  ProjectId,
  UserId,
  generateId,
} from "@domain/shared-kernel";
import { createRepositories } from "@platform/db-postgres";
import { Hono } from "hono";
import { getPostgresClient } from "../clients.ts";
import { extractParam, runUseCase } from "../lib/effect-utils.js";
import { mapErrorToResponse } from "../lib/error-mapper.js";

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
const getCurrentUserId = () => "user-id-placeholder";

export const createProjectsRoutes = () => {
  const repos = createRepositories(getPostgresClient().db);
  const app = new Hono();

  // POST /organizations/:organizationId/projects - Create project
  app.post("/", async (c) => {
    const organizationId = extractParam(c, "organizationId", OrganizationId);
    if (!organizationId) return c.json({ error: "Organization ID is required" }, 400);

    const body = (await c.req.json()) as {
      readonly name: string;
      readonly description?: string;
    };

    const input: CreateProjectInput = {
      id: ProjectId(generateId()),
      organizationId,
      name: body.name,
      ...(body.description !== undefined && { description: body.description }),
      createdById: UserId(getCurrentUserId()),
    };

    const result = await runUseCase(createProjectUseCase(repos.project)(input));

    if (!result.success) {
      const error = result.error;
      if (error instanceof InvalidProjectNameError) {
        return c.json({ error: error.reason, field: "name" }, 400);
      }
      if (error instanceof ProjectAlreadyExistsError) {
        return c.json(
          { error: `Project '${error.name}' already exists in this organization` },
          409,
        );
      }
      return mapErrorToResponse(c, error);
    }

    return c.json(result.data, 201);
  });

  // GET /organizations/:organizationId/projects - List projects
  app.get("/", async (c) => {
    const organizationId = extractParam(c, "organizationId", OrganizationId);
    if (!organizationId) return c.json({ error: "Organization ID is required" }, 400);

    const result = await runUseCase(listProjectsUseCase(repos.project)({ organizationId }));

    if (!result.success) return mapErrorToResponse(c, result.error);
    return c.json({ projects: result.data }, 200);
  });

  // GET /organizations/:organizationId/projects/:id - Get project
  app.get("/:id", async (c) => {
    const organizationId = extractParam(c, "organizationId", OrganizationId);
    const id = extractParam(c, "id", ProjectId);
    if (!organizationId || !id) {
      return c.json({ error: "Organization ID and Project ID are required" }, 400);
    }

    const result = await runUseCase(repos.project.findById(id, organizationId));

    if (!result.success) return mapErrorToResponse(c, result.error);
    if (!result.data) return c.json({ error: "Project not found" }, 404);
    return c.json(result.data, 200);
  });

  // PATCH /organizations/:organizationId/projects/:id - Update project
  app.patch("/:id", async (c) => {
    const organizationId = extractParam(c, "organizationId", OrganizationId);
    const id = extractParam(c, "id", ProjectId);
    if (!organizationId || !id) {
      return c.json({ error: "Organization ID and Project ID are required" }, 400);
    }

    const body = (await c.req.json()) as {
      readonly name?: string;
      readonly description?: string | null;
    };

    // First, find the existing project
    const findResult = await runUseCase(repos.project.findById(id, organizationId));

    if (!findResult.success) return mapErrorToResponse(c, findResult.error);
    if (!findResult.data) return c.json({ error: "Project not found" }, 404);

    // Apply updates
    const updatedProject: Project = {
      ...findResult.data,
      name: body.name !== undefined ? body.name : findResult.data.name,
      description: body.description !== undefined ? body.description : findResult.data.description,
      updatedAt: new Date(),
    };

    const saveResult = await runUseCase(repos.project.save(updatedProject));

    if (!saveResult.success) return mapErrorToResponse(c, saveResult.error);
    return c.json(updatedProject, 200);
  });

  // DELETE /organizations/:organizationId/projects/:id - Soft delete project
  app.delete("/:id", async (c) => {
    const organizationId = extractParam(c, "organizationId", OrganizationId);
    const id = extractParam(c, "id", ProjectId);
    if (!organizationId || !id) {
      return c.json({ error: "Organization ID and Project ID are required" }, 400);
    }

    const result = await runUseCase(repos.project.softDelete(id, organizationId));

    if (!result.success) {
      const error = result.error;
      if (error instanceof NotFoundError) {
        return c.json({ error: "Project not found" }, 404);
      }
      return mapErrorToResponse(c, error);
    }

    return c.body(null, 204);
  });

  return app;
};
