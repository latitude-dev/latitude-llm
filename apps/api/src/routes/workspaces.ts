import { OrganizationId, UserId, WorkspaceId, generateId } from "@domain/shared-kernel";
import {
  type CreateWorkspaceInput,
  InvalidWorkspaceNameError,
  WorkspaceAlreadyExistsError,
  createWorkspaceUseCase,
  getWorkspaceMembersUseCase,
} from "@domain/workspaces";
import { createRepositories } from "@platform/db-postgres";
import { Hono } from "hono";
import { getDb } from "../clients.js";
import { extractParam, runUseCase } from "../lib/effect-utils.js";
import { mapErrorToResponse } from "../lib/error-mapper.js";

/**
 * Workspace routes
 *
 * - POST /workspaces - Create workspace
 * - GET /workspaces - List user's workspaces
 * - GET /workspaces/:id - Get workspace by ID
 * - GET /workspaces/:id/members - List workspace members
 * - DELETE /workspaces/:id - Delete workspace
 */

// Placeholder for getting current user ID - in production, get from auth context
const getCurrentUserId = () => "user-id-placeholder";

export const createWorkspacesRoutes = () => {
  const repos = createRepositories(getDb());
  const app = new Hono();

  // POST /workspaces - Create workspace
  app.post("/", async (c) => {
    const body = (await c.req.json()) as {
      readonly name: string;
      readonly slug: string;
      readonly organizationId: string;
    };

    const input: CreateWorkspaceInput = {
      id: WorkspaceId(generateId()),
      organizationId: OrganizationId(body.organizationId),
      name: body.name,
      slug: body.slug,
      creatorId: UserId(getCurrentUserId()),
    };

    const result = await runUseCase(createWorkspaceUseCase(repos.workspace)(input));

    if (!result.success) {
      const error = result.error;
      if (error instanceof InvalidWorkspaceNameError) {
        return c.json({ error: error.reason, field: "name" }, 400);
      }
      if (error instanceof WorkspaceAlreadyExistsError) {
        return c.json({ error: `Workspace '${error.slug}' already exists` }, 409);
      }
      return mapErrorToResponse(c, error);
    }

    return c.json(result.data, 201);
  });

  // GET /workspaces - List user's workspaces
  app.get("/", async (c) => {
    const result = await runUseCase(repos.workspace.findByUserId(getCurrentUserId()));

    if (!result.success) return mapErrorToResponse(c, result.error);
    return c.json({ workspaces: result.data }, 200);
  });

  // GET /workspaces/:id - Get workspace by ID
  app.get("/:id", async (c) => {
    const id = extractParam(c, "id", WorkspaceId);
    if (!id) return c.json({ error: "Workspace ID required" }, 400);

    const result = await runUseCase(repos.workspace.findById(id));

    if (!result.success) return mapErrorToResponse(c, result.error);
    if (!result.data) return c.json({ error: "Workspace not found" }, 404);
    return c.json(result.data, 200);
  });

  // GET /workspaces/:id/members - List workspace members
  app.get("/:id/members", async (c) => {
    const workspaceId = extractParam(c, "id", WorkspaceId);
    if (!workspaceId) return c.json({ error: "Workspace ID required" }, 400);

    const result = await runUseCase(getWorkspaceMembersUseCase(repos.membership)({ workspaceId }));

    if (!result.success) return mapErrorToResponse(c, result.error);
    return c.json({ members: result.data }, 200);
  });

  // DELETE /workspaces/:id - Delete workspace
  app.delete("/:id", async (c) => {
    const id = extractParam(c, "id", WorkspaceId);
    if (!id) return c.json({ error: "Workspace ID required" }, 400);

    const result = await runUseCase(repos.workspace.delete(id));

    if (!result.success) return mapErrorToResponse(c, result.error);
    return c.body(null, 204);
  });

  return app;
};
