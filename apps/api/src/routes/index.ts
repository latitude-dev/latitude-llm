import { OpenAPIHono } from "@hono/zod-openapi"
import { API_VERSION } from "../constants.ts"
import { registerMcpRoute } from "../mcp/index.ts"
import { createAuthMiddleware } from "../middleware/auth.ts"
import { createOrganizationContextMiddleware } from "../middleware/organization-context.ts"
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
import { createTracesRoutes, tracesPath } from "./traces.ts"
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
  routes.use(
    "*",
    createAuthMiddleware({
      adminClient: options.adminDatabase,
      logTouchBuffer: options.logTouchBuffer,
    }),
  )
  routes.use("*", createOrganizationContextMiddleware())

  routes.route(projectsPath, createProjectsRoutes())
  routes.route(scoresPath, createScoresRoutes())
  routes.route(annotationsPath, createAnnotationsRoutes())
  routes.route(tracesPath, createTracesRoutes())
  routes.route(apiKeysPath, createApiKeysRoutes())
  routes.route(oauthKeysPath, createOAuthKeysRoutes())
  routes.route(accountPath, createAccountRoutes())
  routes.route(membersPath, createMembersRoutes())

  registerMcpRoute({ app, routes })

  v1.route("/", routes)

  app.route(`/${API_VERSION}`, v1)
}
