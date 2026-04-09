import { runSystemQueueFlaggerUseCase } from "@domain/annotation-queues"
import { OrganizationId } from "@domain/shared"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { getClickhouseClient } from "../clients.ts"

const logger = createLogger("workflows-flagger")

export const runFlagger = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
}): Promise<{ matched: boolean }> =>
  Effect.runPromise(
    runSystemQueueFlaggerUseCase(input).pipe(
      withClickHouse(TraceRepositoryLive, getClickhouseClient(), OrganizationId(input.organizationId)),
      Effect.tap(() =>
        Effect.sync(() =>
          logger.info("Ran system queue flagger", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            traceId: input.traceId,
            queueSlug: input.queueSlug,
          }),
        ),
      ),
    ),
  )
