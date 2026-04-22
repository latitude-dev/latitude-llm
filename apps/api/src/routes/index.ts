import { OpenAPIHono } from "@hono/zod-openapi"
import { createAuthMiddleware } from "../middleware/auth.ts"
import { createOrganizationContextMiddleware } from "../middleware/organization-context.ts"
import { createAuthRateLimiter } from "../middleware/rate-limiter.ts"
import { validationErrorMiddleware } from "../middleware/validation.ts"
import type { ApiOptions, AppEnv, ProtectedEnv } from "../types.ts"
import { createAnnotationsRoutes } from "./annotations.ts"
import { createApiKeysRoutes } from "./api-keys.ts"
import { registerHealthRoute } from "./health.ts"
import { createProjectsRoutes } from "./projects.ts"
import { createScoresRoutes } from "./scores.ts"

/**
 * Register all API routes with versioning.
 */
export const registerRoutes = (app: OpenAPIHono<AppEnv>, options: ApiOptions) => {
  const v1 = new OpenAPIHono<AppEnv>()
  const routes = new OpenAPIHono<ProtectedEnv>()

  registerHealthRoute({ app })

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
  // The org entity is loaded on every protected request from the API key's
  // resolved org id. No path param feeds into it — see the middleware.
  routes.use("*", createOrganizationContextMiddleware())

  routes.route("/projects", createProjectsRoutes())
  routes.route("/projects/:projectSlug/scores", createScoresRoutes())
  routes.route("/projects/:projectSlug/annotations", createAnnotationsRoutes())
  routes.route("/api-keys", createApiKeysRoutes())

  v1.route("/", routes)

  app.route("/v1", v1)
}
