import type { RedisClient } from "@platform/cache-redis";
import type { Repositories } from "@platform/db-postgres";
import type { Hono } from "hono";
import { createApiKeysRoutes } from "./api-keys.js";
import { type AuthRouteDeps, createAuthRoutes } from "./auth.js";
import { registerHealthRoute } from "./health.js";
import { createProjectsRoutes } from "./projects.js";
import { createOrganizationsRoutes } from "./workspaces.js";

export interface RoutesContext {
  app: Hono;
  auth: {
    handler: (req: Request) => Promise<Response>;
    api?: AuthRouteDeps["betterAuthApi"];
  };
  redis: RedisClient;
}

export interface RoutesContext {
  app: Hono;
  auth: {
    handler: (req: Request) => Promise<Response>;
    api?: AuthRouteDeps["betterAuthApi"];
  };
  redis: RedisClient;
}

/**
 * Register all API routes.
 *
 * Wires up all route handlers. Routes import their own dependencies
 * from domain/platform packages directly where needed.
 */
export const registerRoutes = (context: RoutesContext) => {
  // Health check route
  registerHealthRoute(context);

  // Auth routes (Better Auth)
  context.app.route(
    "/auth",
    createAuthRoutes({
      betterAuthHandler: context.auth.handler,
      betterAuthApi: context.auth.api,
      redis: context.redis,
    }),
  );

  // Organization routes (using Better Auth organizations as workspaces)
  context.app.route("/organizations", createOrganizationsRoutes());

  // Project routes (nested under organizations)
  context.app.route("/organizations/:organizationId/projects", createProjectsRoutes());

  // API Key routes (nested under organizations)
  context.app.route("/organizations/:organizationId/api-keys", createApiKeysRoutes());
};

// Re-export types for convenience
export type { Repositories };
