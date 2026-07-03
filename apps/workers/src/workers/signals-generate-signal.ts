import type { QueueConsumer } from "@domain/queue"
import { describeError, type FilterSet, filterSetSchema, OrganizationId } from "@domain/shared"
import {
  buildSignalGenerationResultKey,
  type CreateSignalFromPromptInput,
  createSignalFromPromptUseCase,
  SIGNAL_GENERATION_RESULT_TTL_SECONDS,
  type SignalGenerationResult,
} from "@domain/signals"
import { AIGenerateLive, withAi } from "@platform/ai"
import type { RedisClient } from "@platform/cache-redis"
import {
  type ClickHouseClient,
  SessionRepositoryLive,
  SpanRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  EvaluationRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { QuickJsScriptRuntimeLive } from "@platform/sandbox-quickjs"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("signals-generate-signal")
const SIGNALS_GENERATE_SIGNAL_QUEUE = "signals-generate-signal" as const
const SIGNALS_GENERATE_SIGNAL_RUN_TASK = "run" as const

interface SignalsGenerateSignalPayload {
  readonly generationId: string
  readonly organizationId: string
  readonly projectId: string
  readonly prompt: string
  readonly filters?: unknown
}

type SignalsGenerateSignalLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface SignalsGenerateSignalDeps {
  consumer: QueueConsumer
  clickhouseClient?: ClickHouseClient
  postgresClient?: PostgresClient
  redisClient?: RedisClient
  logger?: SignalsGenerateSignalLogger
}

const writeResult = (redisClient: RedisClient, payload: SignalsGenerateSignalPayload, result: SignalGenerationResult) =>
  Effect.tryPromise(() =>
    redisClient.set(
      buildSignalGenerationResultKey(payload.organizationId, payload.generationId),
      JSON.stringify(result),
      "EX",
      SIGNAL_GENERATION_RESULT_TTL_SECONDS,
    ),
  )

// The generation creates a signal at the end, so a stall-recovery redelivery of the same job must
// not run it twice; the first delivery takes the claim, any later one exits without side effects.
const claimJob = (redisClient: RedisClient, payload: SignalsGenerateSignalPayload) =>
  Effect.tryPromise(() =>
    redisClient.set(
      `${buildSignalGenerationResultKey(payload.organizationId, payload.generationId)}:claim`,
      "1",
      "EX",
      SIGNAL_GENERATION_RESULT_TTL_SECONDS,
      "NX",
    ),
  ).pipe(Effect.map((result) => result === "OK"))

const runGenerateSignalJob =
  (deps: {
    readonly clickhouseClient: ClickHouseClient
    readonly postgresClient: PostgresClient
    readonly redisClient: RedisClient
  }) =>
  (payload: SignalsGenerateSignalPayload) => {
    let filters: FilterSet | undefined
    if (payload.filters != null) {
      const parsed = filterSetSchema.safeParse(payload.filters)
      if (!parsed.success) {
        return writeResult(deps.redisClient, payload, {
          status: "error",
          error: "Invalid filters in the generation request.",
        }).pipe(Effect.asVoid)
      }
      filters = parsed.data
    }

    const onStep = (step: string) =>
      writeResult(deps.redisClient, payload, { status: "pending", step }).pipe(Effect.ignore)

    const input: CreateSignalFromPromptInput = {
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      prompt: payload.prompt,
      ...(filters !== undefined ? { filters } : {}),
      onStep,
    }

    return claimJob(deps.redisClient, payload).pipe(
      Effect.flatMap((claimed) => {
        if (!claimed) return Effect.void
        return createSignalFromPromptUseCase(input).pipe(
          withPostgres(
            Layer.mergeAll(EvaluationRepositoryLive, OutboxEventWriterLive, SignalRepositoryLive),
            deps.postgresClient,
            OrganizationId(payload.organizationId),
          ),
          withClickHouse(
            Layer.mergeAll(SessionRepositoryLive, SpanRepositoryLive, TraceRepositoryLive),
            deps.clickhouseClient,
            OrganizationId(payload.organizationId),
          ),
          Effect.provide(QuickJsScriptRuntimeLive),
          withAi(AIGenerateLive, deps.redisClient),
          withTracing,
          Effect.matchEffect({
            onSuccess: (result) =>
              writeResult(deps.redisClient, payload, { status: "done", signalId: result.signalId, slug: result.slug }),
            onFailure: (error) =>
              writeResult(deps.redisClient, payload, { status: "error", error: describeError(error) }),
          }),
        )
      }),
      Effect.asVoid,
    )
  }

export const createSignalsGenerateSignalWorker = ({
  consumer,
  clickhouseClient,
  postgresClient,
  redisClient,
  logger: injectedLogger,
}: SignalsGenerateSignalDeps) => {
  const chClient = clickhouseClient ?? getClickhouseClient()
  const pgClient = postgresClient ?? getPostgresClient()
  const rdClient = redisClient ?? getRedisClient()
  const genLogger = injectedLogger ?? logger
  const run = runGenerateSignalJob({ clickhouseClient: chClient, postgresClient: pgClient, redisClient: rdClient })

  consumer.subscribe(SIGNALS_GENERATE_SIGNAL_QUEUE, {
    run: (payload) =>
      run(payload).pipe(
        Effect.tapError((error) =>
          Effect.sync(() =>
            genLogger.error("Signal generation failed", {
              queue: SIGNALS_GENERATE_SIGNAL_QUEUE,
              task: SIGNALS_GENERATE_SIGNAL_RUN_TASK,
              organizationId: payload.organizationId,
              projectId: payload.projectId,
              generationId: payload.generationId,
              error,
            }),
          ),
        ),
      ),
  })
}
