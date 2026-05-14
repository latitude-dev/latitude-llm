import { OpenAPIHono } from "@hono/zod-openapi"
import { API_VERSION } from "../constants.ts"
import { registerMcpRoute } from "../mcp/index.ts"
import { createAuthMiddleware } from "../middleware/auth.ts"
import { createOrganizationContextMiddleware } from "../middleware/organization-context.ts"
import { createAuthRateLimiter, createTierRateLimiter } from "../middleware/rate-limiter.ts"
import { validationErrorMiddleware } from "../middleware/validation.ts"
import type { ApiOptions, AppEnv, ProtectedEnv } from "../types.ts"
import { accountPath, createAccountRoutes } from "./account.ts"
import { annotationsPath, createAnnotationsRoutes } from "./annotations.ts"
import { apiKeysPath, createApiKeysRoutes } from "./api-keys.ts"
import { registerHealthRoute } from "./health.ts"
import { createMembersRoutes, membersPath } from "./members.ts"
import { createOAuthKeysRoutes, oauthKeysPath } from "./oauth-keys.ts"
import { createProjectsRoutes, projectsPath } from "./projects.ts"
import { createScoresRoutes, scoresPath } from "./scores.ts"
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

  routes.use(projectsPath, createTierRateLimiter("low"))
  routes.route(projectsPath, createProjectsRoutes())

  routes.use(scoresPath, createTierRateLimiter("medium"))
  routes.route(scoresPath, createScoresRoutes())

  routes.use(annotationsPath, createTierRateLimiter("medium"))
  routes.route(annotationsPath, createAnnotationsRoutes())

  routes.use(apiKeysPath, createTierRateLimiter("low"))
  routes.route(apiKeysPath, createApiKeysRoutes())

  routes.use(oauthKeysPath, createTierRateLimiter("low"))
  routes.route(oauthKeysPath, createOAuthKeysRoutes())

  routes.use(accountPath, createTierRateLimiter("low"))
  routes.route(accountPath, createAccountRoutes())

  routes.use(membersPath, createTierRateLimiter("medium"))
  routes.route(membersPath, createMembersRoutes())

  registerMcpRoute({ app, routes })

  v1.route("/", routes)

  app.route(`/${API_VERSION}`, v1)
}
