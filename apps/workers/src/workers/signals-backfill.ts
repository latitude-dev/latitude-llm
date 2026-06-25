import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { QueuePublisher } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { backfillSignalScoresUseCase } from "@domain/signals"
import { type ClickHouseClient, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { EvaluationRepositoryLive, type PostgresClient, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient } from "../clients.ts"

const logger = createLogger("signals-backfill")
const SIGNALS_BACKFILL_QUEUE = "signals-backfill" as const
const SIGNALS_BACKFILL_RUN_TASK = "run" as const

interface SignalsBackfillPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly evaluationId: string
  readonly windowStartIso: string
  readonly cursor?: string
}

type SignalsBackfillLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface SignalsBackfillDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  postgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
  logger?: SignalsBackfillLogger
}

interface RunSignalsBackfillDeps {
  readonly publisher: QueuePublisherShape
  readonly postgresClient: PostgresClient
  readonly clickhouseClient: ClickHouseClient
}

const buildRunLogContext = (payload: SignalsBackfillPayload) => ({
  queue: SIGNALS_BACKFILL_QUEUE,
  task: SIGNALS_BACKFILL_RUN_TASK,
  organizationId: payload.organizationId,
  projectId: payload.projectId,
  signalId: payload.signalId,
  evaluationId: payload.evaluationId,
})

const runSignalsBackfillJob =
  ({ publisher, postgresClient, clickhouseClient }: RunSignalsBackfillDeps) =>
  (payload: SignalsBackfillPayload) =>
    Effect.gen(function* () {
      const result = yield* backfillSignalScoresUseCase(payload)

      // Re-enqueue the next page until the window is exhausted.
      if (!result.done && result.nextCursor !== null) {
        yield* publisher.publish(SIGNALS_BACKFILL_QUEUE, SIGNALS_BACKFILL_RUN_TASK, {
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          signalId: payload.signalId,
          evaluationId: payload.evaluationId,
          windowStartIso: payload.windowStartIso,
          cursor: result.nextCursor,
        })
      }

      return result
    }).pipe(
      Effect.provide(Layer.succeed(QueuePublisher, publisher)),
      withPostgres(EvaluationRepositoryLive, postgresClient, OrganizationId(payload.organizationId)),
      withClickHouse(TraceRepositoryLive, clickhouseClient, OrganizationId(payload.organizationId)),
      withTracing,
    )

const createRunHandler =
  ({ log, ...deps }: RunSignalsBackfillDeps & { readonly log: SignalsBackfillLogger }) =>
  (payload: SignalsBackfillPayload) =>
    runSignalsBackfillJob(deps)(payload).pipe(
      Effect.tap((result) =>
        Effect.sync(() =>
          log.info("Signals backfill page processed", {
            ...buildRunLogContext(payload),
            publishedCount: result.publishedCount,
            done: result.done,
          }),
        ),
      ),
      Effect.tapError((error) =>
        Effect.sync(() => log.error("Signals backfill failed", { ...buildRunLogContext(payload), error })),
      ),
      Effect.asVoid,
    )

export const createSignalsBackfillWorker = ({
  consumer,
  publisher,
  postgresClient,
  clickhouseClient,
  logger: injectedLogger,
}: SignalsBackfillDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()
  const backfillLogger = injectedLogger ?? logger

  consumer.subscribe(SIGNALS_BACKFILL_QUEUE, {
    run: createRunHandler({
      log: backfillLogger,
      publisher,
      postgresClient: pgClient,
      clickhouseClient: chClient,
    }),
  })
}
