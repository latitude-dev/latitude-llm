import {
  type CreateProjectInput,
  InvalidProjectNameError,
  type Project,
  ProjectAlreadyExistsError,
  createProjectUseCase,
  listProjectsUseCase,
} from "@domain/projects";
import { NotFoundError, ProjectId, UserId, WorkspaceId, generateId } from "@domain/shared-kernel";
import { createRepositories } from "@platform/db-postgres";
import { Hono } from "hono";
import { getDb } from "../clients.js";
import { extractParam, runUseCase } from "../lib/effect-utils.js";
import { mapErrorToResponse } from "../lib/error-mapper.js";

/**
 * Project routes
 *
 * - POST /workspaces/:workspaceId/projects - Create project
 * - GET /workspaces/:workspaceId/projects - List projects
 * - GET /workspaces/:workspaceId/projects/:id - Get project
 * - PATCH /workspaces/:workspaceId/projects/:id - Update project
 * - DELETE /workspaces/:workspaceId/projects/:id - Soft delete project
 */

// Placeholder for getting current user ID - in production, get from auth context
const getCurrentUserId = () => "user-id-placeholder";

export const createProjectsRoutes = () => {
  const repos = createRepositories(getDb());
  const app = new Hono();

  // POST /workspaces/:workspaceId/projects - Create project
  app.post("/", async (c) => {
    const workspaceId = extractParam(c, "workspaceId", WorkspaceId);
    if (!workspaceId) return c.json({ error: "Workspace ID is required" }, 400);

    const body = (await c.req.json()) as {
      readonly name: string;
      readonly description?: string;
    };

    const input: CreateProjectInput = {
      id: ProjectId(generateId()),
      workspaceId,
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
        return c.json({ error: `Project '${error.name}' already exists in this workspace` }, 409);
      }
      return mapErrorToResponse(c, error);
    }

    return c.json(result.data, 201);
  });

  // GET /workspaces/:workspaceId/projects - List projects
  app.get("/", async (c) => {
    const workspaceId = extractParam(c, "workspaceId", WorkspaceId);
    if (!workspaceId) return c.json({ error: "Workspace ID is required" }, 400);

    const result = await runUseCase(listProjectsUseCase(repos.project)({ workspaceId }));

    if (!result.success) return mapErrorToResponse(c, result.error);
    return c.json({ projects: result.data }, 200);
  });

  // GET /workspaces/:workspaceId/projects/:id - Get project
  app.get("/:id", async (c) => {
    const workspaceId = extractParam(c, "workspaceId", WorkspaceId);
    const id = extractParam(c, "id", ProjectId);
    if (!workspaceId || !id) {
      return c.json({ error: "Workspace ID and Project ID are required" }, 400);
    }

    const result = await runUseCase(repos.project.findById(id, workspaceId));

    if (!result.success) return mapErrorToResponse(c, result.error);
    if (!result.data) return c.json({ error: "Project not found" }, 404);
    return c.json(result.data, 200);
  });

  // PATCH /workspaces/:workspaceId/projects/:id - Update project
  app.patch("/:id", async (c) => {
    const workspaceId = extractParam(c, "workspaceId", WorkspaceId);
    const id = extractParam(c, "id", ProjectId);
    if (!workspaceId || !id) {
      return c.json({ error: "Workspace ID and Project ID are required" }, 400);
    }

    const body = (await c.req.json()) as {
      readonly name?: string;
      readonly description?: string | null;
    };

    // First, find the existing project
    const findResult = await runUseCase(repos.project.findById(id, workspaceId));

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

  // DELETE /workspaces/:workspaceId/projects/:id - Soft delete project
  app.delete("/:id", async (c) => {
    const workspaceId = extractParam(c, "workspaceId", WorkspaceId);
    const id = extractParam(c, "id", ProjectId);
    if (!workspaceId || !id) {
      return c.json({ error: "Workspace ID and Project ID are required" }, 400);
    }

    const result = await runUseCase(repos.project.softDelete(id, workspaceId));

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
