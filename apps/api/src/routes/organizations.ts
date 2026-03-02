import {
  type CreateOrganizationInput,
  createOrganizationUseCase,
  getOrganizationMembersUseCase,
} from "@domain/organizations";
import { OrganizationId, UserId, generateId } from "@domain/shared-kernel";
import { createRepositories } from "@platform/db-postgres";
import { Effect } from "effect";
import { Hono } from "hono";
import { getPostgresClient } from "../clients.ts";
import { BadRequestError } from "../errors.ts";
import { extractParam } from "../lib/effect-utils.ts";

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

    const organization = await Effect.runPromise(
      createOrganizationUseCase(repos.organization)(input),
    );

    return c.json(organization, 201);
  });

  // GET /organizations - List user's organizations
  app.get("/", async (c) => {
    const organizations = await Effect.runPromise(repos.organization.findAll());
    return c.json({ organizations }, 200);
  });

  // GET /organizations/:id - Get organization by ID
  app.get("/:id", async (c) => {
    const id = extractParam(c, "id", OrganizationId);
    if (!id) {
      throw new BadRequestError({ httpMessage: "Organization ID required" });
    }

    const organization = await Effect.runPromise(repos.organization.findById(id));

    if (!organization) {
      throw new BadRequestError({ httpMessage: "Organization not found" });
    }

    return c.json(organization, 200);
  });

  // GET /organizations/:id/members - List organization members
  app.get("/:id/members", async (c) => {
    const organizationId = extractParam(c, "id", OrganizationId);
    if (!organizationId) {
      throw new BadRequestError({ httpMessage: "Organization ID required" });
    }

    const members = await Effect.runPromise(
      getOrganizationMembersUseCase(repos.membership)({ organizationId }),
    );

    return c.json({ members }, 200);
  });

  // DELETE /organizations/:id - Delete organization
  app.delete("/:id", async (c) => {
    const id = extractParam(c, "id", OrganizationId);
    if (!id) {
      throw new BadRequestError({ httpMessage: "Organization ID required" });
    }

    await Effect.runPromise(repos.organization.delete(id));
    return c.body(null, 204);
  });

  return app;
};
