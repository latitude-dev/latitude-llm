import {
  buildTraceEndEvaluationSelectionInputs,
  listAllActiveEvaluations,
  orchestrateTraceEndLiveEvaluationExecutesUseCase,
} from "@domain/evaluations"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { OrganizationId, SignalId } from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import {
  loadTraceForTraceEndUseCase,
  selectTraceEndItemsUseCase,
  summarizeTraceEndItemDecisions,
  type TraceEndItemDecisionCounts,
} from "@domain/spans"
import { RedisCacheStoreLive, type RedisClient } from "@platform/cache-redis"
import {
  type ClickHouseClient,
  ScoreAnalyticsRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  EvaluationRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ScoreRepositoryLive,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("signals-match")
const SIGNALS_QUEUE = "signals" as const
const SIGNALS_MATCH_TASK = "match" as const

interface SignalsMatchPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly isSandbox?: boolean
}

type SignalsMatchLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface SignalsMatchDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  postgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
  redisClient?: RedisClient
  logger?: SignalsMatchLogger
}

interface RunSignalsMatchDeps {
  readonly publisher: QueuePublisherShape
  readonly postgresClient: PostgresClient
  readonly clickhouseClient: ClickHouseClient
  readonly redisClient: RedisClient
}

type SignalsMatchRunSummary = TraceEndItemDecisionCounts & {
  readonly traceId: string
  readonly sessionId: string | null
  readonly activeEvaluationsScanned: number
  readonly skippedIneligibleCount: number
  readonly skippedTurnCount: number
  readonly publishedExecuteCount: number
}

type SignalsMatchRunResult =
  | {
      readonly action: "skipped"
      readonly reason: "trace-not-found" | "sandbox"
      readonly traceId: string
    }
  | {
      readonly action: "completed"
      readonly summary: SignalsMatchRunSummary
    }

const buildRunLogContext = (payload: SignalsMatchPayload) => ({
  queue: SIGNALS_QUEUE,
  task: SIGNALS_MATCH_TASK,
  organizationId: payload.organizationId,
  projectId: payload.projectId,
  traceId: payload.traceId,
})

/**
 * The single evaluation matching pipeline: every active evaluation (all signal-linked) is selected
 * and executed here, replacing trace-end's former evaluation fan-out. Selection (sampling / turn /
 * filter pre-gate) reuses the shared trace-end selection use-cases; surviving evaluations are
 * published to the existing `live-evaluations:execute` queue, which runs `runLiveEvaluationUseCase`.
 */
export const runSignalsMatchJob =
  ({ publisher, postgresClient, clickhouseClient, redisClient }: RunSignalsMatchDeps) =>
  (payload: SignalsMatchPayload) =>
    Effect.gen(function* () {
      if (payload.isSandbox) {
        return { action: "skipped", reason: "sandbox", traceId: payload.traceId } satisfies SignalsMatchRunResult
      }

      const loaded = yield* loadTraceForTraceEndUseCase(payload)

      if (loaded.kind === "skipped") {
        return {
          action: "skipped",
          reason: "trace-not-found",
          traceId: payload.traceId,
        } satisfies SignalsMatchRunResult
      }

      const traceDetail = loaded.traceDetail

      const activeEvaluations = yield* listAllActiveEvaluations({ projectId: traceDetail.projectId })
      const signalRepository = yield* SignalRepository
      const signalIds = [...new Set(activeEvaluations.map((evaluation) => SignalId(evaluation.signalId)))]
      const signals =
        signalIds.length > 0
          ? yield* signalRepository.findByIds({ projectId: traceDetail.projectId, signalIds })
          : []
      const signalFiltersBySignalId = new Map(signals.map((signal) => [signal.id, signal.filters ?? null]))
      const evalBuilt = buildTraceEndEvaluationSelectionInputs(activeEvaluations, signalFiltersBySignalId)

      const decisions = yield* selectTraceEndItemsUseCase({
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        traceId: payload.traceId,
        items: evalBuilt.items,
      })

      const decisionCounts = summarizeTraceEndItemDecisions([...evalBuilt.evaluationByKey.keys()], decisions)

      const selectedEvaluations = [...evalBuilt.evaluationByKey.entries()]
        .filter(([key]) => decisions[key]?.selected === true)
        .map(([, evaluation]) => evaluation)

      const { skippedTurnCount, publishedExecuteCount } = yield* orchestrateTraceEndLiveEvaluationExecutesUseCase({
        publishExecute: (pubInput) =>
          publisher.publish(
            "live-evaluations",
            "execute",
            {
              organizationId: pubInput.organizationId,
              projectId: pubInput.projectId,
              evaluationId: pubInput.evaluationId,
              traceId: pubInput.traceId,
            },
            {
              ...(pubInput.dedupeKey !== undefined ? { dedupeKey: pubInput.dedupeKey } : {}),
              ...(pubInput.debounceMs !== undefined ? { debounceMs: pubInput.debounceMs } : {}),
            },
          ),
      })({
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        traceId: payload.traceId,
        traceProjectId: traceDetail.projectId,
        traceRowId: traceDetail.traceId,
        sessionId: traceDetail.sessionId ?? null,
        selectedEvaluations,
      })

      return {
        action: "completed",
        summary: {
          ...decisionCounts,
          traceId: traceDetail.traceId,
          sessionId: traceDetail.sessionId ?? null,
          activeEvaluationsScanned: activeEvaluations.length,
          skippedIneligibleCount: evalBuilt.skippedIneligibleCount,
          skippedTurnCount,
          publishedExecuteCount,
        },
      } satisfies SignalsMatchRunResult
    }).pipe(
      withPostgres(
        Layer.mergeAll(EvaluationRepositoryLive, OutboxEventWriterLive, ScoreRepositoryLive, SignalRepositoryLive),
        postgresClient,
        OrganizationId(payload.organizationId),
      ),
      withClickHouse(
        Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive),
        clickhouseClient,
        OrganizationId(payload.organizationId),
      ),
      Effect.provide(RedisCacheStoreLive(redisClient)),
      withTracing,
    )

export const createRunHandler =
  ({ log, ...deps }: RunSignalsMatchDeps & { readonly log: SignalsMatchLogger }) =>
  (payload: SignalsMatchPayload) =>
    runSignalsMatchJob(deps)(payload).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          if (result.action === "skipped") {
            log.info("Signals match skipped", {
              ...buildRunLogContext(payload),
              outcome: result.action,
              reason: result.reason,
            })
            return
          }

          log.info("Signals match completed", {
            ...buildRunLogContext(payload),
            outcome: result.action,
            sessionId: result.summary.sessionId,
            activeEvaluationsScanned: result.summary.activeEvaluationsScanned,
            skippedIneligibleCount: result.summary.skippedIneligibleCount,
            skippedTurnCount: result.summary.skippedTurnCount,
            publishedExecuteCount: result.summary.publishedExecuteCount,
          })
        }),
      ),
      Effect.tapError((error) =>
        Effect.sync(() =>
          log.error("Signals match failed", {
            ...buildRunLogContext(payload),
            outcome: "failed",
            error,
          }),
        ),
      ),
      Effect.asVoid,
    )

export const createSignalsMatchWorker = ({
  consumer,
  publisher,
  postgresClient,
  clickhouseClient,
  redisClient,
  logger: injectedLogger,
}: SignalsMatchDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()
  const rdClient = redisClient ?? getRedisClient()
  const matchLogger = injectedLogger ?? logger

  consumer.subscribe(SIGNALS_QUEUE, {
    match: createRunHandler({
      log: matchLogger,
      publisher,
      postgresClient: pgClient,
      clickhouseClient: chClient,
      redisClient: rdClient,
    }),
  })
}
