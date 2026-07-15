import { CONVERSATION_INTELLIGENCE_ANALYSIS_DEBOUNCE_MS } from "@domain/conversation-intelligence"
import { SAVED_SEARCH_MONITORS_THROTTLE_MS, savedSearchMonitorsCheckDedupeKey } from "@domain/monitors"
import type { QueueConsumer, QueuePublisherShape, WorkflowStarterShape } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { loadTraceForTraceEndUseCase } from "@domain/spans"
import { type ClickHouseClient, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"

import { getClickhouseClient, getWorkflowStarter } from "../clients.ts"

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
  workflowStarter?: WorkflowStarterShape
}

interface RunTraceEndDeps {
  readonly publisher: QueuePublisherShape
  readonly clickhouseClient: ClickHouseClient
  readonly workflowStarter: WorkflowStarterShape
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
  ({ publisher, clickhouseClient, workflowStarter }: RunTraceEndDeps) =>
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

      // Evaluation selection + execution moved to the signals:match worker. trace-end now owns only
      // flaggers, saved-search monitors, trace-search, and conversation intelligence.

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

      // Materialize the settled trace's memory-operation spans into the memory
      // ledger. Its own worker + failure domain, like deterministic-flaggers.
      yield* publisher
        .publish(
          "memory-projection",
          "run",
          {
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            traceId: payload.traceId,
          },
          {
            dedupeKey: `org:${payload.organizationId}:memory-projection:${payload.projectId}:${payload.traceId}`,
          },
        )
        .pipe(
          Effect.catch((error) =>
            Effect.logError("Failed to enqueue memory-projection", {
              ...buildRunLogContext(payload),
              error,
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

      // "Trace ends → match signals": run every active evaluation against the now-settled trace.
      // The sandbox early-return above means this never fires for sandbox traces.
      yield* publisher
        .publish(
          "signals",
          "match",
          {
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            traceId: payload.traceId,
            isSandbox: payload.isSandbox ?? false,
            reason: "ingest",
          },
          {
            dedupeKey: `org:${payload.organizationId}:signals-match:${payload.projectId}:${payload.traceId}`,
          },
        )
        .pipe(
          Effect.catch((error) =>
            Effect.logError("Failed to enqueue signals match", { ...buildRunLogContext(payload), error }),
          ),
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

      const canonicalSessionId =
        traceDetail.sessionId && traceDetail.sessionId.length > 0 ? traceDetail.sessionId : traceDetail.traceId
      const analyzeSessionWorkflowId = `org:${payload.organizationId}:conversation-intelligence:analyzeSession:${payload.projectId}:${canonicalSessionId}`
      yield* workflowStarter
        .signalWithStart(
          "analyzeSessionWorkflow",
          {
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            sessionId: canonicalSessionId,
            triggeringTraceId: payload.traceId,
            triggeringStartTime: traceDetail.startTime.toISOString(),
            reason: "trace_completed",
            debounceMs: CONVERSATION_INTELLIGENCE_ANALYSIS_DEBOUNCE_MS,
          },
          {
            workflowId: analyzeSessionWorkflowId,
            signal: "traceCompleted",
            signalArgs: [{ debounceMs: CONVERSATION_INTELLIGENCE_ANALYSIS_DEBOUNCE_MS }],
          },
        )
        .pipe(
          Effect.catch((error) =>
            Effect.logError("Failed to start conversation intelligence AnalyzeSessionWorkflow", {
              ...buildRunLogContext(payload),
              sessionId: canonicalSessionId,
              workflowId: analyzeSessionWorkflowId,
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
  workflowStarter,
}: TraceEndDeps) => {
  const chClient = clickhouseClient ?? getClickhouseClient()
  const traceEndLogger = injectedLogger ?? logger
  const temporalStarter =
    workflowStarter ??
    ({
      start: (...args) =>
        Effect.promise(() => getWorkflowStarter()).pipe(Effect.flatMap((starter) => starter.start(...args))),
      signalWithStart: (...args) =>
        Effect.promise(() => getWorkflowStarter()).pipe(Effect.flatMap((starter) => starter.signalWithStart(...args))),
    } satisfies WorkflowStarterShape)

  consumer.subscribe(TRACE_END_QUEUE, {
    run: createRunHandler({
      log: traceEndLogger,
      publisher,
      clickhouseClient: chClient,
      workflowStarter: temporalStarter,
    }),
  })
}
