import type { QueueConsumer, WorkflowStarterShape } from "@domain/queue"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("evaluations")

interface EvaluationsDeps {
  consumer: QueueConsumer
  workflowStarter: WorkflowStarterShape
}

// Temporal's `start` fails deterministically when a workflow with the same id
// is already running (`workflowIdConflictPolicy: "FAIL"`). For the delayed
// auto-alignment tasks that's a benign race: the same evaluation already has a
// run in flight (e.g. a manual realignment a user just kicked off), so the
// queued auto run can be safely dropped — the in-flight run will observe the
// latest state when it finishes. Log and succeed.
const swallowAlreadyStarted = (workflowId: string) =>
  Effect.catchDefect((defect: unknown) => {
    if (defect instanceof Error && defect.name === "WorkflowExecutionAlreadyStartedError") {
      logger.info("Skipping evaluation workflow start: already running", { workflowId })
      return Effect.void
    }
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
          swallowAlreadyStarted(workflowId),
          Effect.tapError((error) =>
            Effect.sync(() =>
              logger.error(
                `Refresh-alignment workflow start failed for ${payload.projectId}/${payload.evaluationId}`,
                error,
              ),
            ),
          ),
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
          swallowAlreadyStarted(workflowId),
          Effect.tapError((error) =>
            Effect.sync(() =>
              logger.error(
                `Automatic-optimization workflow start failed for ${payload.projectId}/${payload.evaluationId}`,
                error,
              ),
            ),
          ),
          Effect.asVoid,
          withTracing,
        )
    },
  })
}
