import { ProjectRepository } from "@domain/projects"
import { isNotFoundError, OrganizationId } from "@domain/shared"
import { ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect } from "effect"
import type { MiddlewareHandler } from "hono"
import { getPostgresClient } from "../clients.ts"
import type { IngestEnv } from "../types.ts"

/**
 * Resolves the project from the X-Latitude-Project header (project slug).
 * Must run after auth middleware (requires organizationId on context).
 */
export const projectMiddleware: MiddlewareHandler<IngestEnv> = async (c, next) => {
  const projectSlug = c.req.header("X-Latitude-Project")
  if (!projectSlug) {
    return c.json({ error: "X-Latitude-Project header is required" }, 400)
  }

  const organizationId = c.get("organizationId")
  const client = getPostgresClient()

  try {
    const project = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.findBySlug(projectSlug)
      }).pipe(withPostgres(ProjectRepositoryLive, client, OrganizationId(organizationId)), withTracing),
    )

    c.set("projectId", project.id as string)
    await next()
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json({ error: "Project not found" }, 404)
    }
    throw error
  }
}
