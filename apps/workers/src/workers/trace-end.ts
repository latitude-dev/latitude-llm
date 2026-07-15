import { SAVED_SEARCH_MONITORS_THROTTLE_MS, savedSearchMonitorsCheckDedupeKey } from "@domain/monitors"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { loadTraceForTraceEndUseCase, SESSION_END_DEBOUNCE_MS } from "@domain/spans"
import { type ClickHouseClient, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"

import { getClickhouseClient } from "../clients.ts"

const logger = createLogger("trace-end")
const TRACE_END_QUEUE = "trace-end" as const
const TRACE_END_RUN_TASK = "run" as const

interface TraceEndPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly isSandbox?: boolean
}

type TraceEndLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface TraceEndDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  clickhouseClient?: ClickHouseClient
  logger?: TraceEndLogger
}

interface RunTraceEndDeps {
  readonly publisher: QueuePublisherShape
  readonly clickhouseClient: ClickHouseClient
}

type TraceEndRunSummary = {
  readonly traceId: string
  readonly sessionId: string | null
  readonly deterministicFlaggersEnqueued: boolean
}

type TraceEndRunResult =
  | {
      readonly action: "skipped"
      readonly reason: "trace-not-found" | "sandbox"
      readonly traceId: string
    }
  | {
      readonly action: "completed"
      readonly summary: TraceEndRunSummary
    }

const buildRunLogContext = (payload: TraceEndPayload) => ({
  queue: TRACE_END_QUEUE,
  task: TRACE_END_RUN_TASK,
  organizationId: payload.organizationId,
  projectId: payload.projectId,
  traceId: payload.traceId,
})

export const runTraceEndJob =
  ({ publisher, clickhouseClient }: RunTraceEndDeps) =>
  (payload: TraceEndPayload) =>
    Effect.gen(function* () {
      if (payload.isSandbox) {
        return { action: "skipped", reason: "sandbox", traceId: payload.traceId } satisfies TraceEndRunResult
      }

      const loaded = yield* loadTraceForTraceEndUseCase(payload)

      if (loaded.kind === "skipped") {
        return {
          action: "skipped",
          reason: "trace-not-found",
          traceId: payload.traceId,
        } satisfies TraceEndRunResult
      }

      const traceDetail = loaded.traceDetail

      // trace-end owns per-trace fan-out: deterministic flaggers, trace-search, and saved-search
      // monitors. Session-level work (signals:match, session analysis) is delegated to session-end.

      // Hand the deterministic-flagger fan-out to its own worker. Per-strategy
      // isolation (Effect.catch) lives there, so a broken detector can't
      // fail the whole trace-end job.
      const deterministicFlaggersEnqueued = yield* publisher
        .publish(
          "deterministic-flaggers",
          "run",
          {
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            traceId: payload.traceId,
          },
          {
            dedupeKey: `deterministic-flaggers:${payload.traceId}`,
          },
        )
        .pipe(
          Effect.map(() => true),
          Effect.catch((error) =>
            Effect.gen(function* () {
              yield* Effect.logError("Failed to enqueue deterministic-flaggers", {
                ...buildRunLogContext(payload),
                error,
              })
              return false
            }),
          ),
        )

      // Publish trace-search refresh task after successful trace-end completion
      yield* publisher.publish("trace-search", "refreshTrace", {
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        traceId: payload.traceId,
        startTime: traceDetail.startTime.toISOString(),
        rootSpanName: traceDetail.rootSpanName,
        isSandbox: payload.isSandbox ?? false,
      })

      const canonicalSessionId =
        traceDetail.sessionId && traceDetail.sessionId.length > 0 ? traceDetail.sessionId : traceDetail.traceId

      // "Trace ends → session settles": hand session-level work (signals:match, session analysis) to
      // the session-end worker, debounced per session so repeated trace-ends collapse to one firing
      // once the session goes quiet. The debounce replaces the pending payload, so the surviving job
      // carries the session's latest trace. Never fires for sandbox traces (sandbox returns early).
      //
      // Not caught: session-end is the single entry point for both signals:match and session analysis,
      // so a dropped enqueue would silently lose all session-level work. Let it fail the trace-end job
      // so its retry re-enqueues; the job's other publishes are idempotent under retry via dedupe keys.
      yield* publisher.publish(
        "session-end",
        "run",
        {
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          sessionId: canonicalSessionId,
          latestTraceId: payload.traceId,
          latestTraceStartTime: traceDetail.startTime.toISOString(),
          isSandbox: payload.isSandbox ?? false,
        },
        {
          dedupeKey: `org:${payload.organizationId}:session-end:${payload.projectId}:${canonicalSessionId}`,
          debounceMs: SESSION_END_DEBOUNCE_MS,
        },
      )

      // Saved-search firing check, throttled to one run per project per 5 min.
      // Leading-edge: runs immediately so its trailing evaluation window covers
      // the traces that triggered it, instead of sliding 5 min past them.
      yield* publisher
        .publish(
          "monitors",
          "checkSavedSearchMonitors",
          { organizationId: payload.organizationId, projectId: payload.projectId },
          {
            dedupeKey: savedSearchMonitorsCheckDedupeKey({
              organizationId: payload.organizationId,
              projectId: payload.projectId,
            }),
            leadingThrottleMs: SAVED_SEARCH_MONITORS_THROTTLE_MS,
          },
        )
        .pipe(
          Effect.catch((error) =>
            Effect.logError("Failed to enqueue saved-search monitors check", {
              ...buildRunLogContext(payload),
              error,
            }),
          ),
        )

      return {
        action: "completed",
        summary: {
          traceId: traceDetail.traceId,
          sessionId: traceDetail.sessionId ?? null,
          deterministicFlaggersEnqueued,
        },
      } satisfies TraceEndRunResult
    }).pipe(withClickHouse(TraceRepositoryLive, clickhouseClient, OrganizationId(payload.organizationId)), withTracing)

export const createRunHandler =
  ({ log, ...deps }: RunTraceEndDeps & { readonly log: TraceEndLogger }) =>
  (payload: TraceEndPayload) =>
    runTraceEndJob(deps)(payload).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          if (result.action === "skipped") {
            log.info("Trace-end runtime skipped", {
              ...buildRunLogContext(payload),
              outcome: result.action,
              reason: result.reason,
            })
            return
          }

          log.info("Trace-end runtime completed", {
            ...buildRunLogContext(payload),
            outcome: result.action,
            sessionId: result.summary.sessionId,
            deterministicFlaggersEnqueued: result.summary.deterministicFlaggersEnqueued,
          })
        }),
      ),
      Effect.tapError((error) =>
        Effect.sync(() =>
          log.error("Trace-end runtime failed", {
            ...buildRunLogContext(payload),
            outcome: "failed",
            error,
          }),
        ),
      ),
      Effect.asVoid,
    )

export const createTraceEndWorker = ({
  consumer,
  publisher,
  clickhouseClient,
  logger: injectedLogger,
}: TraceEndDeps) => {
  const chClient = clickhouseClient ?? getClickhouseClient()
  const traceEndLogger = injectedLogger ?? logger

  consumer.subscribe(TRACE_END_QUEUE, {
    run: createRunHandler({
      log: traceEndLogger,
      publisher,
      clickhouseClient: chClient,
    }),
  })
}
