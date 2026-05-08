import { OpenAPIHono } from "@hono/zod-openapi"
import { API_VERSION } from "../constants.ts"
import { mountWithMcp, registerMcpRoute } from "../mcp/index.ts"
import { createAuthMiddleware } from "../middleware/auth.ts"
import { createOrganizationContextMiddleware } from "../middleware/organization-context.ts"
import { createAuthRateLimiter } from "../middleware/rate-limiter.ts"
import { validationErrorMiddleware } from "../middleware/validation.ts"
import type { ApiOptions, AppEnv, ProtectedEnv } from "../types.ts"
import { createAnnotationsRoutes } from "./annotations.ts"
import { apiKeysEndpoints } from "./api-keys.ts"
import { registerHealthRoute } from "./health.ts"
import { createProjectsRoutes } from "./projects.ts"
import { createScoresRoutes } from "./scores.ts"
import { registerWellKnownRoutes } from "./well-known.ts"

/**
 * Register all API routes with versioning.
 */
export const registerRoutes = (app: OpenAPIHono<AppEnv>, options: ApiOptions) => {
  const v1 = new OpenAPIHono<AppEnv>()
  const routes = new OpenAPIHono<ProtectedEnv>()

  registerHealthRoute({ app })
  registerWellKnownRoutes({ app })

  v1.use("*", async (c, next) => {
    c.set("db", options.database.db)
    c.set("postgresClient", options.database)
    c.set("redis", options.redis)
    c.set("clickhouse", options.clickhouse)
    c.set("queuePublisher", options.queuePublisher)
    await next()
  })

  routes.use("*", validationErrorMiddleware)
  routes.use("*", createAuthRateLimiter()) // Rate limiting before auth prevents brute force attacks
  routes.use(
    "*",
    createAuthMiddleware({
      adminClient: options.adminDatabase,
      logTouchBuffer: options.logTouchBuffer,
    }),
  )
  routes.use("*", createOrganizationContextMiddleware())

  routes.route("/projects", createProjectsRoutes())
  routes.route("/projects/:projectSlug/scores", createScoresRoutes())
  routes.route("/projects/:projectSlug/annotations", createAnnotationsRoutes())
  mountWithMcp(routes, "/api-keys", apiKeysEndpoints)

  registerMcpRoute(app, routes, "/mcp")

  v1.route("/", routes)

  app.route(`/${API_VERSION}`, v1)
}
