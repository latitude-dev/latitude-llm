import { EVALUATION_ALIGNMENT_REFRESH_SIGNAL } from "@domain/evaluations"
import type { QueueConsumer, WorkflowStarterShape } from "@domain/queue"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("evaluations")

interface EvaluationsDeps {
  consumer: QueueConsumer
  workflowStarter: WorkflowStarterShape
}

export const createEvaluationsWorker = ({ consumer, workflowStarter }: EvaluationsDeps) => {
  consumer.subscribe("evaluations", {
    align: (payload) =>
      workflowStarter
        .signalWithStart(
          "evaluationAlignmentWorkflow",
          {
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            issueId: payload.issueId,
            evaluationId: payload.evaluationId,
            jobId: `auto-refresh:${payload.evaluationId}`,
            refreshLoop: true,
            reason: "debounced-metric-refresh",
          },
          {
            workflowId: `evaluations:alignment:${payload.evaluationId}`,
            signal: EVALUATION_ALIGNMENT_REFRESH_SIGNAL,
            signalArgs: [
              {
                reason: "debounced-metric-refresh",
                jobId: `auto-refresh:${payload.evaluationId}`,
              },
            ],
          },
        )
        .pipe(
          Effect.tap(() =>
            Effect.sync(() =>
              logger.info("Queued evaluation alignment refresh", {
                projectId: payload.projectId,
                issueId: payload.issueId,
                evaluationId: payload.evaluationId,
              }),
            ),
          ),
          Effect.tapError((error) =>
            Effect.sync(() =>
              logger.error(
                `Evaluation alignment refresh failed for ${payload.projectId}/${payload.evaluationId}`,
                error,
              ),
            ),
          ),
          Effect.asVoid,
          withTracing,
        ),
  })
}
