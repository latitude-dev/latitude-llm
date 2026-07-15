import type { QueueConsumer, QueuePublisherShape, WorkflowStarterShape } from "@domain/queue"
import { OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { SessionRepository, SpanRepository } from "@domain/spans"
import {
  type ClickHouseClient,
  SessionRepositoryLive,
  SpanRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

import { getClickhouseClient, getWorkflowStarter } from "../clients.ts"

const logger = createLogger("session-end")
const SESSION_END_QUEUE = "session-end" as const
const SESSION_END_RUN_TASK = "run" as const

interface SessionEndPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly latestTraceId: string
  readonly latestTraceStartTime: string
  readonly isSandbox?: boolean
}

type SessionEndLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface SessionEndDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  clickhouseClient?: ClickHouseClient
  logger?: SessionEndLogger
  workflowStarter?: WorkflowStarterShape
}

interface RunSessionEndDeps {
  readonly publisher: QueuePublisherShape
  readonly clickhouseClient: ClickHouseClient
  readonly workflowStarter: WorkflowStarterShape
}

type SessionEndRunResult =
  | {
      readonly action: "skipped"
      readonly reason: "sandbox"
      readonly sessionId: string
    }
  | {
      readonly action: "completed"
      readonly sessionId: string
      readonly latestTraceId: string
    }

const buildRunLogContext = (payload: SessionEndPayload) => ({
  queue: SESSION_END_QUEUE,
  task: SESSION_END_RUN_TASK,
  organizationId: payload.organizationId,
  projectId: payload.projectId,
  sessionId: payload.sessionId,
  latestTraceId: payload.latestTraceId,
})

/**
 * The session's latest output-producing trace, resolved by time rather than by enqueue order: the
 * debounce that hands us here is last-write-wins, so a late span on an older trace can leave the
 * payload pointing at a trace that isn't actually the newest. Uses the same `argMax(end_time)` the
 * session panel surfaces as "current state". Falls back to the enqueued trace when the session isn't
 * materialized yet or the read fails — signals should still run on the best trace we have.
 */
const resolveLatestTraceId = (payload: SessionEndPayload) =>
  Effect.gen(function* () {
    const sessionRepository = yield* SessionRepository
    const spanRepository = yield* SpanRepository

    const detail = yield* sessionRepository
      .findBySessionId({
        organizationId: OrganizationId(payload.organizationId),
        projectId: ProjectId(payload.projectId),
        sessionId: SessionId(payload.sessionId),
      })
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (!detail || detail.traceIds.length === 0) return payload.latestTraceId

    const latest = yield* spanRepository.findLatestOutputTraceId({
      organizationId: OrganizationId(payload.organizationId),
      projectId: ProjectId(payload.projectId),
      traceIds: detail.traceIds.map(TraceId),
    })

    return latest ?? payload.latestTraceId
  }).pipe(
    Effect.catch((error) =>
      Effect.gen(function* () {
        yield* Effect.logWarning("Failed to resolve session latest trace; using enqueued trace", {
          ...buildRunLogContext(payload),
          error,
        })
        return payload.latestTraceId
      }),
    ),
  )

export const runSessionEndJob =
  ({ publisher, clickhouseClient, workflowStarter }: RunSessionEndDeps) =>
  (payload: SessionEndPayload) =>
    Effect.gen(function* () {
      if (payload.isSandbox) {
        return { action: "skipped", reason: "sandbox", sessionId: payload.sessionId } satisfies SessionEndRunResult
      }

      const latestTraceId = yield* resolveLatestTraceId(payload)

      // Session settled → match signals against the session's latest trace (per-trace scoring is
      // unchanged; the script still loads full session context). Older traces are intentionally not
      // re-evaluated — one evaluation per session, off its latest trace.
      yield* publisher
        .publish(
          "signals",
          "match",
          {
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            traceId: latestTraceId,
            isSandbox: false,
            reason: "ingest",
          },
          {
            dedupeKey: `org:${payload.organizationId}:signals-match:${payload.projectId}:${latestTraceId}`,
          },
        )
        .pipe(
          Effect.catch((error) =>
            Effect.logError("Failed to enqueue signals match", { ...buildRunLogContext(payload), error }),
          ),
        )

      // Session analysis reloads the whole session, so the triggering trace is only a pointer — the
      // enqueued one is fine here, no need for the resolved latest.
      const analyzeSessionWorkflowId = `org:${payload.organizationId}:conversation-intelligence:analyzeSession:${payload.projectId}:${payload.sessionId}`
      yield* workflowStarter
        .signalWithStart(
          "analyzeSessionWorkflow",
          {
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            sessionId: payload.sessionId,
            triggeringTraceId: payload.latestTraceId,
            triggeringStartTime: payload.latestTraceStartTime,
            reason: "trace_completed",
          },
          {
            workflowId: analyzeSessionWorkflowId,
            signal: "traceCompleted",
            signalArgs: [{}],
          },
        )
        .pipe(
          Effect.catch((error) =>
            Effect.logError("Failed to start conversation intelligence AnalyzeSessionWorkflow", {
              ...buildRunLogContext(payload),
              workflowId: analyzeSessionWorkflowId,
              error,
            }),
          ),
        )

      return {
        action: "completed",
        sessionId: payload.sessionId,
        latestTraceId,
      } satisfies SessionEndRunResult
    }).pipe(
      withClickHouse(
        Layer.mergeAll(SessionRepositoryLive, SpanRepositoryLive),
        clickhouseClient,
        OrganizationId(payload.organizationId),
      ),
      withTracing,
    )

export const createRunHandler =
  ({ log, ...deps }: RunSessionEndDeps & { readonly log: SessionEndLogger }) =>
  (payload: SessionEndPayload) =>
    runSessionEndJob(deps)(payload).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          if (result.action === "skipped") {
            log.info("Session-end runtime skipped", {
              ...buildRunLogContext(payload),
              outcome: result.action,
              reason: result.reason,
            })
            return
          }

          log.info("Session-end runtime completed", {
            ...buildRunLogContext(payload),
            outcome: result.action,
            resolvedLatestTraceId: result.latestTraceId,
          })
        }),
      ),
      Effect.tapError((error) =>
        Effect.sync(() =>
          log.error("Session-end runtime failed", {
            ...buildRunLogContext(payload),
            outcome: "failed",
            error,
          }),
        ),
      ),
      Effect.asVoid,
    )

export const createSessionEndWorker = ({
  consumer,
  publisher,
  clickhouseClient,
  logger: injectedLogger,
  workflowStarter,
}: SessionEndDeps) => {
  const chClient = clickhouseClient ?? getClickhouseClient()
  const sessionEndLogger = injectedLogger ?? logger
  const temporalStarter =
    workflowStarter ??
    ({
      start: (...args) =>
        Effect.promise(() => getWorkflowStarter()).pipe(Effect.flatMap((starter) => starter.start(...args))),
      signalWithStart: (...args) =>
        Effect.promise(() => getWorkflowStarter()).pipe(Effect.flatMap((starter) => starter.signalWithStart(...args))),
    } satisfies WorkflowStarterShape)

  consumer.subscribe(SESSION_END_QUEUE, {
    run: createRunHandler({
      log: sessionEndLogger,
      publisher,
      clickhouseClient: chClient,
      workflowStarter: temporalStarter,
    }),
  })
}
