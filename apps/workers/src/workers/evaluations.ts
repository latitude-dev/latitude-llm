import type { QueueConsumer, WorkflowStarterShape } from "@domain/queue"
import { generateId } from "@domain/shared"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("evaluations")

interface EvaluationsDeps {
  consumer: QueueConsumer
  workflowStarter: WorkflowStarterShape
}

// `workflowStarter.start` is built on `Effect.promise`, so every failure — the
// expected `WorkflowExecutionAlreadyStartedError` and anything else (Temporal
// unavailable, auth errors, etc.) — surfaces as an Effect *defect*, not a
// typed error. `Effect.tapError` wouldn't observe any of them. We route all
// defect handling through a single `Effect.catchDefect` so the benign race
// is swallowed while genuinely unexpected failures get logged here before
// propagating back out as a defect (BullMQ then records a failed job and
// the job is retried by its own policy).
const handleStartDefects = (context: { workflowId: string; description: string }) =>
  Effect.catchDefect((defect: unknown) => {
    if (defect instanceof Error && defect.name === "WorkflowExecutionAlreadyStartedError") {
      logger.info("Skipping evaluation workflow start: already running", { workflowId: context.workflowId })
      return Effect.void
    }
    logger.error(`${context.description} workflow start failed for ${context.workflowId}`, defect)
    return Effect.die(defect)
  })

export const createEvaluationsWorker = ({ consumer, workflowStarter }: EvaluationsDeps) => {
  consumer.subscribe("evaluations", {
    automaticRefreshAlignment: (payload) => {
      const workflowId = `evaluations:refreshAlignment:${payload.evaluationId}`
      return workflowStarter
        .start(
          "refreshEvaluationAlignmentWorkflow",
          {
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            issueId: payload.issueId,
            evaluationId: payload.evaluationId,
          },
          { workflowId },
        )
        .pipe(
          Effect.tap(() =>
            Effect.sync(() =>
              logger.info("Started evaluation refresh alignment workflow", {
                projectId: payload.projectId,
                issueId: payload.issueId,
                evaluationId: payload.evaluationId,
                workflowId,
              }),
            ),
          ),
          handleStartDefects({ workflowId, description: "Refresh-alignment" }),
          Effect.asVoid,
          withTracing,
        )
    },
    automaticOptimization: (payload) => {
      const workflowId = `evaluations:optimize:${payload.evaluationId}`
      return workflowStarter
        .start(
          "optimizeEvaluationWorkflow",
          {
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            issueId: payload.issueId,
            evaluationId: payload.evaluationId,
            jobId: `auto-optimize:${payload.evaluationId}`,
            billingOperationId: generateId(),
          },
          { workflowId },
        )
        .pipe(
          Effect.tap(() =>
            Effect.sync(() =>
              logger.info("Started evaluation optimization workflow", {
                projectId: payload.projectId,
                issueId: payload.issueId,
                evaluationId: payload.evaluationId,
                workflowId,
              }),
            ),
          ),
          handleStartDefects({ workflowId, description: "Automatic-optimization" }),
          Effect.asVoid,
          withTracing,
        )
    },
  })
}
