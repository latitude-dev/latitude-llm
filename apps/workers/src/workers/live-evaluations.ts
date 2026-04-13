import { enqueueLiveEvaluationsUseCase } from "@domain/evaluations"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { EvaluationRepositoryLive, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient } from "../clients.ts"

const logger = createLogger("live-evaluations")

interface EnqueuePayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
}

interface LiveEvaluationsDeps {
  consumer: QueueConsumer
}

// TODO(eval-sandbox): when implementing live evaluation execution, use the same extract-and-call
// approach from executeEvaluationScript for MVP, then migrate to sandboxed JS runtime.
export const createLiveEvaluationsWorker = ({ consumer }: LiveEvaluationsDeps) => {
  const pgClient = getPostgresClient()
  const chClient = getClickhouseClient()

  consumer.subscribe("live-evaluations", {
    enqueue: (payload: EnqueuePayload) =>
      enqueueLiveEvaluationsUseCase(payload).pipe(
        withPostgres(
          Layer.mergeAll(EvaluationRepositoryLive, ScoreRepositoryLive),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        withClickHouse(TraceRepositoryLive, chClient, OrganizationId(payload.organizationId)),
        Effect.tap((result) =>
          Effect.sync(() => {
            if (result.action === "skipped") {
              logger.info("Live evaluation enqueue skipped", {
                organizationId: payload.organizationId,
                projectId: payload.projectId,
                traceId: payload.traceId,
                reason: result.reason,
              })
              return
            }

            logger.info("Live evaluation enqueue completed", {
              organizationId: payload.organizationId,
              projectId: payload.projectId,
              ...result.summary,
            })
          }),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error("Live evaluation enqueue failed", {
              organizationId: payload.organizationId,
              projectId: payload.projectId,
              traceId: payload.traceId,
              error,
            }),
          ),
        ),
        Effect.asVoid,
      ),
    execute: () => Effect.sync(() => logger.info("Stub handler for live-evaluations:execute")),
  })
}
