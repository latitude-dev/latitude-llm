import {
  type CreateOrganizationInput,
  InvalidOrganizationNameError,
  OrganizationAlreadyExistsError,
  createOrganizationUseCase,
  getOrganizationMembersUseCase,
} from "@domain/organizations";
import { OrganizationId, UserId, generateId } from "@domain/shared-kernel";
import { createRepositories } from "@platform/db-postgres";
import { Hono } from "hono";
import { getPostgresClient } from "../clients.ts";
import { extractParam, runUseCase } from "../lib/effect-utils.js";
import { mapErrorToResponse } from "../lib/error-mapper.js";

/**
 * Organization routes
 *
 * - POST /organizations - Create organization
 * - GET /organizations - List user's organizations
 * - GET /organizations/:id - Get organization by ID
 * - GET /organizations/:id/members - List organization members
 * - DELETE /organizations/:id - Delete organization
 */

// Placeholder for getting current user ID - in production, get from auth context
const getCurrentUserId = () => "user-id-placeholder";

export const createOrganizationsRoutes = () => {
  const repos = createRepositories(getPostgresClient().db);
  const app = new Hono();

  // POST /organizations - Create organization
  app.post("/", async (c) => {
    const body = (await c.req.json()) as {
      readonly name: string;
      readonly slug: string;
    };

    const input: CreateOrganizationInput = {
      id: OrganizationId(generateId()),
      name: body.name,
      slug: body.slug,
      creatorId: UserId(getCurrentUserId()),
    };

    const result = await runUseCase(createOrganizationUseCase(repos.organization)(input));

    if (!result.success) {
      const error = result.error;
      if (error instanceof InvalidOrganizationNameError) {
        return c.json({ error: error.reason, field: "name" }, 400);
      }
      if (error instanceof OrganizationAlreadyExistsError) {
        return c.json({ error: `Organization '${error.slug}' already exists` }, 409);
      }
      return mapErrorToResponse(c, error);
    }

    return c.json(result.data, 201);
  });

  // GET /organizations - List user's organizations
  app.get("/", async (c) => {
    const result = await runUseCase(repos.organization.findAll());

    if (!result.success) return mapErrorToResponse(c, result.error);
    return c.json({ organizations: result.data }, 200);
  });

  // GET /organizations/:id - Get organization by ID
  app.get("/:id", async (c) => {
    const id = extractParam(c, "id", OrganizationId);
    if (!id) return c.json({ error: "Organization ID required" }, 400);

    const result = await runUseCase(repos.organization.findById(id));

    if (!result.success) return mapErrorToResponse(c, result.error);
    if (!result.data) return c.json({ error: "Organization not found" }, 404);
    return c.json(result.data, 200);
  });

  // GET /organizations/:id/members - List organization members
  app.get("/:id/members", async (c) => {
    const organizationId = extractParam(c, "id", OrganizationId);
    if (!organizationId) return c.json({ error: "Organization ID required" }, 400);

    const result = await runUseCase(
      getOrganizationMembersUseCase(repos.membership)({ organizationId }),
    );

    if (!result.success) return mapErrorToResponse(c, result.error);
    return c.json({ members: result.data }, 200);
  });

  // DELETE /organizations/:id - Delete organization
  app.delete("/:id", async (c) => {
    const id = extractParam(c, "id", OrganizationId);
    if (!id) return c.json({ error: "Organization ID required" }, 400);

    const result = await runUseCase(repos.organization.delete(id));

    if (!result.success) return mapErrorToResponse(c, result.error);
    return c.body(null, 204);
  });

  return app;
};
