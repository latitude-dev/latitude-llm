import { ProjectRepository } from "@domain/projects"
import { OrganizationId, ProjectId, isNotFoundError } from "@domain/shared"
import { ProjectRepositoryLive, SqlClientLive } from "@platform/db-postgres"
import { Effect } from "effect"
import type { MiddlewareHandler } from "hono"
import { getPostgresClient } from "../clients.ts"
import type { IngestEnv } from "../types.ts"

/**
 * Resolves the project from the X-Latitude-Project header (project ID).
 * Must run after auth middleware (requires organizationId on context).
 */
export const projectMiddleware: MiddlewareHandler<IngestEnv> = async (c, next) => {
  const projectId = c.req.header("X-Latitude-Project")
  if (!projectId) {
    return c.json({ error: "X-Latitude-Project header is required" }, 400)
  }

  const organizationId = c.get("organizationId")
  const client = getPostgresClient()

  try {
    const project = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.findById(ProjectId(projectId))
      }).pipe(
        Effect.provide(ProjectRepositoryLive),
        Effect.provide(SqlClientLive(client, OrganizationId(organizationId))),
      ),
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
