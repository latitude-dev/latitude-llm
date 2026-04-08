import { runSystemQueueFlaggerUseCase } from "@domain/annotation-queues"
import { OrganizationId } from "@domain/shared"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { getClickhouseClient } from "../clients.ts"

const logger = createLogger("workflows-flagger")

const runSystemQueueFlagger = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
}) =>
  Effect.runPromise(
    runSystemQueueFlaggerUseCase(input).pipe(
      withClickHouse(TraceRepositoryLive, getClickhouseClient(), OrganizationId(input.organizationId)),
    ),
  )

/**
 * System queue flagger interface.
 *
 * The actual queue-specific flagging logic lives in
 * `@domain/annotation-queues/runSystemQueueFlaggerUseCase`, where queue slugs
 * map to concrete flagger methods.
 *
 * Future work can:
 * - Add richer flagger payloads (confidence, explanation, evidence)
 * - Add the Resource Outliers matcher once project median baselines exist
 * - Replace the remaining stubbed queues with low-cost LLM classification
 */
export const runFlagger = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
}): Promise<{ matched: boolean }> => {
  logger.info("Running flagger", {
    organizationId: input.organizationId,
    projectId: input.projectId,
    traceId: input.traceId,
    queueSlug: input.queueSlug,
  })

  return await runSystemQueueFlagger(input)
}
