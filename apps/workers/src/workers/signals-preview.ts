import {
  buildSignalPreviewResultKey,
  type PreviewEvaluationInput,
  previewEvaluationUseCase,
  SIGNAL_PREVIEW_RESULT_TTL_SECONDS,
  type SignalPreviewResult,
} from "@domain/evaluations"
import type { QueueConsumer } from "@domain/queue"
import { type FilterSet, OrganizationId } from "@domain/shared"
import { AIGenerateLive, withAi } from "@platform/ai"
import type { RedisClient } from "@platform/cache-redis"
import {
  type ClickHouseClient,
  SessionRepositoryLive,
  SpanRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import { QuickJsScriptRuntimeLive } from "@platform/sandbox-quickjs"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

import { getClickhouseClient, getRedisClient } from "../clients.ts"

const logger = createLogger("signals-preview")
const SIGNALS_PREVIEW_QUEUE = "signals-preview" as const
const SIGNALS_PREVIEW_RUN_TASK = "run" as const

interface SignalsPreviewPayload {
  readonly previewId: string
  readonly organizationId: string
  readonly projectId: string
  readonly evaluation: { readonly settings: unknown } | { readonly script: string }
  readonly filters?: unknown
}

type SignalsPreviewLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface SignalsPreviewDeps {
  consumer: QueueConsumer
  clickhouseClient?: ClickHouseClient
  redisClient?: RedisClient
  logger?: SignalsPreviewLogger
}

const describeError = (error: unknown): string =>
  typeof error === "object" && error !== null && "message" in error
    ? String((error as { message: unknown }).message)
    : String(error)

const writeResult = (redisClient: RedisClient, payload: SignalsPreviewPayload, result: SignalPreviewResult) =>
  Effect.tryPromise(() =>
    redisClient.set(
      buildSignalPreviewResultKey(payload.organizationId, payload.previewId),
      JSON.stringify(result),
      "EX",
      SIGNAL_PREVIEW_RESULT_TTL_SECONDS,
    ),
  )

const runSignalsPreviewJob =
  (deps: { readonly clickhouseClient: ClickHouseClient; readonly redisClient: RedisClient }) =>
  (payload: SignalsPreviewPayload) => {
    const input: PreviewEvaluationInput = {
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      evaluation: payload.evaluation as PreviewEvaluationInput["evaluation"],
      ...(payload.filters != null ? { filters: payload.filters as FilterSet } : {}),
    }

    return previewEvaluationUseCase(input).pipe(
      withClickHouse(
        Layer.mergeAll(SessionRepositoryLive, SpanRepositoryLive, TraceRepositoryLive),
        deps.clickhouseClient,
        OrganizationId(payload.organizationId),
      ),
      Effect.provide(QuickJsScriptRuntimeLive),
      withAi(AIGenerateLive, deps.redisClient),
      withTracing,
      Effect.matchEffect({
        onSuccess: (result) => writeResult(deps.redisClient, payload, { status: "done", items: result.items }),
        onFailure: (error) => writeResult(deps.redisClient, payload, { status: "error", error: describeError(error) }),
      }),
      Effect.asVoid,
    )
  }

export const createSignalsPreviewWorker = ({
  consumer,
  clickhouseClient,
  redisClient,
  logger: injectedLogger,
}: SignalsPreviewDeps) => {
  const chClient = clickhouseClient ?? getClickhouseClient()
  const rdClient = redisClient ?? getRedisClient()
  const previewLogger = injectedLogger ?? logger
  const run = runSignalsPreviewJob({ clickhouseClient: chClient, redisClient: rdClient })

  consumer.subscribe(SIGNALS_PREVIEW_QUEUE, {
    run: (payload) =>
      run(payload).pipe(
        Effect.tapError((error) =>
          Effect.sync(() =>
            previewLogger.error("Signals preview failed", {
              queue: SIGNALS_PREVIEW_QUEUE,
              task: SIGNALS_PREVIEW_RUN_TASK,
              organizationId: payload.organizationId,
              projectId: payload.projectId,
              previewId: payload.previewId,
              error,
            }),
          ),
        ),
      ),
  })
}
