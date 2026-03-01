import type { Repositories } from "@platform/db-postgres";
import type { Hono } from "hono";
import { createApiKeysRoutes } from "./api-keys.js";
import { createAuthRoutes } from "./auth.js";
import { registerHealthRoute } from "./health.js";
import { createOrganizationsRoutes } from "./organizations.js";
import { createProjectsRoutes } from "./projects.js";

export interface RoutesContext {
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

// Re-export types for convenience
export type { Repositories };
