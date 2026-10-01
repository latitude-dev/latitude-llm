import type { QueueConsumer } from "@domain/queue"
import {
  cleanupPublishedOutboxEvents,
  OutboxCleanupError,
  type OutboxCleanupResult,
  type PostgresClient,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("outbox-cleanup")

interface OutboxCleanupDeps {
  consumer: QueueConsumer
  postgresClient: PostgresClient
}

const annotateCleanupResult = (result: OutboxCleanupResult) =>
  Effect.annotateCurrentSpan({
    "outbox.cleanup.deletedCount": result.deletedCount,
    "outbox.cleanup.batchCount": result.batchCount,
    "outbox.cleanup.durationMs": result.durationMs,
    "outbox.cleanup.cutoff": result.cutoff,
    "outbox.cleanup.limitReached": result.limitReached,
  })

export const createOutboxCleanupWorker = ({ consumer, postgresClient }: OutboxCleanupDeps) => {
  consumer.subscribe(
    "outbox-cleanup",
    {
      run: () =>
        Effect.gen(function* () {
          const result = yield* Effect.tryPromise({
            try: () => cleanupPublishedOutboxEvents(postgresClient),
            catch: (cause) => cause,
          }).pipe(
            Effect.tapError((error) =>
              Effect.gen(function* () {
                if (error instanceof OutboxCleanupError) yield* annotateCleanupResult(error.progress)
                logger.error("Outbox cleanup failed", {
                  ...(error instanceof OutboxCleanupError ? error.progress : {}),
                  error,
                })
              }),
            ),
          )
          yield* annotateCleanupResult(result)
          logger.info("Outbox cleanup completed", result)
        }).pipe(Effect.withSpan("workers.outboxCleanup.run"), withTracing),
    },
    { concurrency: 1 },
  )
}
