import {
  buildScriptGenerationResultKey,
  type CreateScriptFromPromptInput,
  createScriptFromPromptUseCase,
  SCRIPT_GENERATION_RESULT_TTL_SECONDS,
  type ScriptGenerationResult,
} from "@domain/evaluations"
import type { QueueConsumer } from "@domain/queue"
import { describeError, type FilterSet, filterSetSchema, OrganizationId } from "@domain/shared"
import { AIEmbedLive, AIGenerateLive, withAi } from "@platform/ai"
import type { RedisClient } from "@platform/cache-redis"
import {
  type ClickHouseClient,
  MessageEmbeddingRepositoryLive,
  SessionRepositoryLive,
  SpanRepositoryLive,
  TraceRepositoryLive,
  TraceSearchRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import { QuickJsScriptRuntimeLive } from "@platform/sandbox-quickjs"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

import { getClickhouseClient, getRedisClient } from "../clients.ts"

const logger = createLogger("signals-generate-script")
const SIGNALS_GENERATE_SCRIPT_QUEUE = "signals-generate-script" as const
const SIGNALS_GENERATE_SCRIPT_RUN_TASK = "run" as const

interface SignalsGenerateScriptPayload {
  readonly generationId: string
  readonly organizationId: string
  readonly projectId: string
  readonly prompt: string
  readonly filters?: unknown
}

type SignalsGenerateScriptLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface SignalsGenerateScriptDeps {
  consumer: QueueConsumer
  clickhouseClient?: ClickHouseClient
  redisClient?: RedisClient
  logger?: SignalsGenerateScriptLogger
}

const writeResult = (redisClient: RedisClient, payload: SignalsGenerateScriptPayload, result: ScriptGenerationResult) =>
  Effect.tryPromise(() =>
    redisClient.set(
      buildScriptGenerationResultKey(payload.organizationId, payload.generationId),
      JSON.stringify(result),
      "EX",
      SCRIPT_GENERATION_RESULT_TTL_SECONDS,
    ),
  )

const runGenerateScriptJob =
  (deps: { readonly clickhouseClient: ClickHouseClient; readonly redisClient: RedisClient }) =>
  (payload: SignalsGenerateScriptPayload) => {
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

    const input: CreateScriptFromPromptInput = {
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      prompt: payload.prompt,
      ...(filters !== undefined ? { filters } : {}),
    }

    return createScriptFromPromptUseCase(input).pipe(
      withClickHouse(
        Layer.mergeAll(
          SessionRepositoryLive,
          SpanRepositoryLive,
          TraceRepositoryLive,
          MessageEmbeddingRepositoryLive,
          TraceSearchRepositoryLive,
        ),
        deps.clickhouseClient,
        OrganizationId(payload.organizationId),
      ),
      Effect.provide(QuickJsScriptRuntimeLive),
      withAi(Layer.mergeAll(AIGenerateLive, AIEmbedLive), deps.redisClient),
      withTracing,
      Effect.matchEffect({
        onSuccess: (result) =>
          writeResult(deps.redisClient, payload, {
            status: "done",
            script: result.script,
            reasoning: result.reasoning,
          }),
        onFailure: (error) => writeResult(deps.redisClient, payload, { status: "error", error: describeError(error) }),
      }),
      Effect.asVoid,
    )
  }

export const createSignalsGenerateScriptWorker = ({
  consumer,
  clickhouseClient,
  redisClient,
  logger: injectedLogger,
}: SignalsGenerateScriptDeps) => {
  const chClient = clickhouseClient ?? getClickhouseClient()
  const rdClient = redisClient ?? getRedisClient()
  const genLogger = injectedLogger ?? logger
  const run = runGenerateScriptJob({ clickhouseClient: chClient, redisClient: rdClient })

  consumer.subscribe(SIGNALS_GENERATE_SCRIPT_QUEUE, {
    run: (payload) =>
      run(payload).pipe(
        Effect.tapError((error) =>
          Effect.sync(() =>
            genLogger.error("Signal script generation failed", {
              queue: SIGNALS_GENERATE_SCRIPT_QUEUE,
              task: SIGNALS_GENERATE_SCRIPT_RUN_TASK,
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
