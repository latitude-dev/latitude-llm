import { ProjectRepository } from "@domain/projects"
import { ForbiddenError, NotFoundError } from "@domain/shared"
import { ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect } from "effect"
import type { Context, MiddlewareHandler, Next } from "hono"

/**
 * Enforces project scope for API keys that are bound to a single project.
 *
 * - Org-wide keys and OAuth tokens are unchanged.
 * - Anything that is not `/projects/{slug}` or a nested project route is
 *   organization-level (`/projects` list+create, `/api-keys`, `/oauth-keys`,
 *   `/members`, `/account`, `/usage`, …) and returns 403.
 * - `/mcp` is exempt: the dispatcher re-enters the real route, which is
 *   checked again. A project key calling an org tool still 403s there.
 * - A project route whose slug is unknown or names a different project
 *   returns 404, the same as an unknown slug. We do not reveal that the
 *   other project exists.
 */
const PROJECT_ROUTE = /^\/projects\/([^/]+)(?:\/.*)?$/

export const createApiKeyProjectScopeMiddleware = (): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const auth = c.get("auth")
    if (!auth || auth.method !== "api-key" || auth.projectId == null) {
      await next()
      return
    }

    const pathname = new URL(c.req.url).pathname.replace(/^\/v\d+/, "")
    if (pathname === "/mcp" || pathname.startsWith("/mcp/")) {
      await next()
      return
    }

    const match = PROJECT_ROUTE.exec(pathname)
    if (!match || !match[1]) {
      throw new ForbiddenError({
        message: "Project-scoped API keys cannot access organization routes",
      })
    }

    const slug = decodeURIComponent(match[1])
    const project = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.findBySlug(slug).pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      }).pipe(withPostgres(ProjectRepositoryLive, c.var.postgresClient, auth.organizationId), withTracing),
    )

    if (!project || project.id !== auth.projectId) {
      throw new NotFoundError({ entity: "Project", id: slug })
    }

    await next()
  }
}
