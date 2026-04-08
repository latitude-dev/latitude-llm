import { provisionSystemQueuesUseCase } from "@domain/annotation-queues"
import { OrganizationId, ProjectId } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { AnnotationQueueRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("projects")

export const provisionSystemQueues = async (input: { readonly organizationId: string; readonly projectId: string }) => {
  const startTime = Date.now()

  const result = await Effect.runPromise(
    provisionSystemQueuesUseCase({
      organizationId: input.organizationId,
      projectId: ProjectId(input.projectId),
    }).pipe(
      withPostgres(AnnotationQueueRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      Effect.provide(RedisCacheStoreLive(getRedisClient())),
    ),
  )

  const duration = Date.now() - startTime
  logger.info("Provisioned system queues for project", {
    organizationId: input.organizationId,
    projectId: input.projectId,
    durationMs: duration,
    results: result,
  })

  return result
}
