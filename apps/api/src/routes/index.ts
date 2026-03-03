import type { ClickHouseClient } from "@clickhouse/client"
import type { RedisClient } from "@platform/cache-redis"
import type { PostgresClient } from "@platform/db-postgres"
import { Hono } from "hono"
import { createAuthMiddleware } from "../middleware/auth.ts"
import { createAuthRateLimiter } from "../middleware/rate-limiter.ts"
import { createApiKeysRoutes } from "./api-keys.ts"
import { createAuthRoutes } from "./auth.ts"
import { registerHealthRoute } from "./health.ts"
import { createOrganizationsRoutes } from "./organizations.ts"
import { createProjectsRoutes } from "./projects.ts"

interface RoutesContext {
  app: Hono
  database: PostgresClient
  clickhouse: ClickHouseClient
  redis: RedisClient
}

/**
 * Register all API routes with versioning.
 */
export const registerRoutes = (context: RoutesContext) => {
  const { app } = context

  const v1 = new Hono()
  const protectedRoutes = new Hono()

  registerHealthRoute(context)

  // Make shared dependencies available via request context.
  v1.use("*", async (c, next) => {
    c.set("db", context.database.db)
    c.set("redis", context.redis)
    await next()
  })

  // Auth routes (Better Auth) - PUBLIC, no auth required
  v1.route("/auth", createAuthRoutes())

  // Rate limiting before auth to prevent brute force attacks
  protectedRoutes.use("*", createAuthRateLimiter())
  protectedRoutes.use("*", createAuthMiddleware())

  protectedRoutes.route("/", createOrganizationsRoutes())
  protectedRoutes.route("/:organizationId/projects", createProjectsRoutes())
  protectedRoutes.route("/:organizationId/api-keys", createApiKeysRoutes())

  v1.route("/organizations", protectedRoutes)
  app.route("/v1", v1)
}
