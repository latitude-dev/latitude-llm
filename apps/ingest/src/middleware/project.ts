import { ProjectId, isNotFoundError } from "@domain/shared"
import { createProjectPostgresRepository, runCommand } from "@platform/db-postgres"
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
  const { db } = getPostgresClient()

  try {
    const project = await runCommand(
      db,
      organizationId,
    )(async (txDb) => {
      const repo = createProjectPostgresRepository(txDb)
      return Effect.runPromise(repo.findById(ProjectId(projectId)))
    })

    c.set("projectId", project.id as string)
    await next()
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json({ error: "Project not found" }, 404)
    }
    throw error
  }
}
