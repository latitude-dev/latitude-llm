import { OpenAPIHono } from "@hono/zod-openapi"
import { mountOperationModules, operationModules } from "@repo/operations"
import { API_VERSION } from "../constants.ts"
import { registerMcpRoute } from "../mcp/server.ts"
import { createAuthMiddleware } from "../middleware/auth.ts"
import { createOrganizationContextMiddleware } from "../middleware/organization-context.ts"
import { createTierRateLimiter } from "../middleware/rate-limiter.ts"
import { validationErrorMiddleware } from "../middleware/validation.ts"
import type { ApiOptions, AppEnv, ProtectedEnv } from "../types.ts"
import { registerBootstrapRoute } from "./bootstrap.ts"
import { registerHealthRoute } from "./health.ts"
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
    c.set("workflowStarter", options.workflowStarter)
    c.set("workflowQuerier", options.workflowQuerier)
    c.set("storageDisk", options.storageDisk)
    await next()
  })

  registerBootstrapRoute({ app: v1, adminDatabase: options.adminDatabase })

  routes.use("*", validationErrorMiddleware)
  routes.use(
    "*",
    createAuthMiddleware({
      adminClient: options.adminDatabase,
      logTouchBuffer: options.logTouchBuffer,
    }),
  )
  routes.use("*", createOrganizationContextMiddleware())

  mountOperationModules(routes, operationModules, { middlewareForTier: createTierRateLimiter })

  // Back-compat: the Issues API moved to /signals. 307 preserves method + body so
  // already-published SDKs calling /issues keep working at runtime.
  // TODO(signals): remove once the issues alias is retired.
  // Anchored on the project-slug segment so a project literally slugged "issues" isn't rewritten.
  const toSignalsPath = (pathname: string): string =>
    pathname.replace(/(\/projects\/[^/]+)\/issues(\/|$)/, "$1/signals$2")
  routes.all("/projects/:projectSlug/issues", (c) => {
    const url = new URL(c.req.url)
    url.pathname = toSignalsPath(url.pathname)
    return c.redirect(url.toString(), 307)
  })
  routes.all("/projects/:projectSlug/issues/*", (c) => {
    const url = new URL(c.req.url)
    url.pathname = toSignalsPath(url.pathname)
    return c.redirect(url.toString(), 307)
  })

  registerMcpRoute({ app, routes })

  v1.route("/", routes)

  app.route(`/${API_VERSION}`, v1)
}
