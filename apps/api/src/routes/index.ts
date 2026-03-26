import type { ClickHouseClient } from "@clickhouse/client"
import { OpenAPIHono } from "@hono/zod-openapi"
import type { RedisClient } from "@platform/cache-redis"
import type { PostgresClient } from "@platform/db-postgres"
import { createAuthMiddleware } from "../middleware/auth.ts"
import { createOrganizationContextMiddleware } from "../middleware/organization-context.ts"
import { createAuthRateLimiter } from "../middleware/rate-limiter.ts"
import type { ProtectedEnv } from "../types.ts"
import { createApiKeysRoutes } from "./api-keys.ts"
import { registerHealthRoute } from "./health.ts"
import { createProjectsRoutes } from "./projects.ts"

interface RoutesContext {
  app: OpenAPIHono
  database: PostgresClient
  clickhouse: ClickHouseClient
  redis: RedisClient
}

/**
 * Register all API routes with versioning.
 */
export const registerRoutes = (context: RoutesContext) => {
  const { app } = context

  const v1 = new OpenAPIHono()
  const protectedRoutes = new OpenAPIHono<ProtectedEnv>()

  registerHealthRoute({ app })

  // Make shared dependencies available via request context.
  v1.use("*", async (c, next) => {
    c.set("db", context.database.db)
    c.set("postgresClient", context.database)
    c.set("redis", context.redis)
    c.set("clickhouse", context.clickhouse)

    await next()
  }) // available via c.var.*

  protectedRoutes.use("*", createAuthRateLimiter()) // Rate limiting before auth prevents brute force attacks
  protectedRoutes.use("*", createAuthMiddleware())
  protectedRoutes.use("/:organizationId/*", createOrganizationContextMiddleware())

  protectedRoutes.route("/:organizationId/projects", createProjectsRoutes())
  protectedRoutes.route("/:organizationId/api-keys", createApiKeysRoutes())

  v1.route("/organizations", protectedRoutes)

  app.route("/v1", v1)
}
