import type { QueueConsumer } from "@domain/queue"
import {
  cleanupPublishedOutboxEvents,
  OutboxCleanupError,
  type OutboxCleanupResult,
  type PostgresClient,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Schedule } from "effect"

const logger = createLogger("outbox-cleanup")
const OUTBOX_CLEANUP_MAX_ATTEMPTS = 3
const OUTBOX_CLEANUP_RETRY_SCHEDULE = Schedule.exponential("5 seconds")

interface OutboxCleanupDeps {
  consumer: QueueConsumer
  postgresClient: PostgresClient
  retrySchedule?: Schedule.Schedule<unknown, unknown>
}

const annotateCleanupResult = (result: OutboxCleanupResult) =>
  Effect.annotateCurrentSpan({
    "outbox.cleanup.deletedCount": result.deletedCount,
    "outbox.cleanup.batchCount": result.batchCount,
    "outbox.cleanup.durationMs": result.durationMs,
    "outbox.cleanup.cutoff": result.cutoff,
    "outbox.cleanup.limitReached": result.limitReached,
  })

export const createOutboxCleanupWorker = ({
  consumer,
  postgresClient,
  retrySchedule = OUTBOX_CLEANUP_RETRY_SCHEDULE,
}: OutboxCleanupDeps) => {
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
            Effect.retry(Schedule.both(retrySchedule, Schedule.recurs(OUTBOX_CLEANUP_MAX_ATTEMPTS - 1))),
          )
          yield* annotateCleanupResult(result)
          logger.info("Outbox cleanup completed", result)
        }).pipe(Effect.withSpan("workers.outboxCleanup.run"), withTracing),
    },
    { concurrency: 1 },
  )
}
