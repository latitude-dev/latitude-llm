import { provisionFlaggersUseCase } from "@domain/flaggers"
import { OrganizationId, ProjectId } from "@domain/shared"
import { FlaggerRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"
import { getPostgresClient } from "../clients.ts"

const logger = createLogger("projects")

export const provisionFlaggers = async (input: { readonly organizationId: string; readonly projectId: string }) => {
  const startTime = Date.now()

  const result = await Effect.runPromise(
    provisionFlaggersUseCase({
      organizationId: input.organizationId,
      projectId: ProjectId(input.projectId),
    }).pipe(
      withPostgres(FlaggerRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      withTracing,
    ),
  )

  const duration = Date.now() - startTime
  logger.info("Provisioned flaggers for project", {
    organizationId: input.organizationId,
    projectId: input.projectId,
    durationMs: duration,
    flaggers: result.length,
  })

  return result
}
