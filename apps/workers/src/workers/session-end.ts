import type { QueueConsumer, QueuePublisherShape, WorkflowStarterShape } from "@domain/queue"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"

import { getWorkflowStarter } from "../clients.ts"

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
  logger?: SessionEndLogger
  workflowStarter?: WorkflowStarterShape
}

interface RunSessionEndDeps {
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
    }

const buildRunLogContext = (payload: SessionEndPayload) => ({
  queue: SESSION_END_QUEUE,
  task: SESSION_END_RUN_TASK,
  organizationId: payload.organizationId,
  projectId: payload.projectId,
  sessionId: payload.sessionId,
  latestTraceId: payload.latestTraceId,
})

export const runSessionEndJob =
  ({ workflowStarter }: RunSessionEndDeps) =>
  (payload: SessionEndPayload) =>
    Effect.gen(function* () {
      if (payload.isSandbox) {
        return { action: "skipped", reason: "sandbox", sessionId: payload.sessionId } satisfies SessionEndRunResult
      }

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
      } satisfies SessionEndRunResult
    }).pipe(withTracing)

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
  publisher: _publisher,
  logger: injectedLogger,
  workflowStarter,
}: SessionEndDeps) => {
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
      workflowStarter: temporalStarter,
    }),
  })
}
