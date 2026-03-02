import type { Hono } from "hono";
import { createApiKeysRoutes } from "./api-keys.ts";
import { createAuthRoutes } from "./auth.ts";
import { registerHealthRoute } from "./health.ts";
import { createOrganizationsRoutes } from "./organizations.ts";
import { createProjectsRoutes } from "./projects.ts";

interface RoutesContext {
  app: Hono;
}

/**
 * Register all API routes.
 *
 * Wires up all route handlers. Routes import their own dependencies
 * from domain/platform packages directly where needed.
 */
export const registerRoutes = (context: RoutesContext) => {
  const { app } = context;

  // Health check route
  registerHealthRoute(context);

  // Auth routes (Better Auth) - dependencies declared/imported inside createAuthRoutes
  app.route("/auth", createAuthRoutes());

  // Organization routes (using Better Auth organizations as workspaces)
  app.route("/organizations", createOrganizationsRoutes());

  // Project routes (nested under organizations)
  app.route("/organizations/:organizationId/projects", createProjectsRoutes());

  // API Key routes (nested under organizations)
  app.route("/organizations/:organizationId/api-keys", createApiKeysRoutes());
};
