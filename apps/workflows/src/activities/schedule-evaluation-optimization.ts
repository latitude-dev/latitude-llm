import { ALIGNMENT_FULL_REOPTIMIZE_THROTTLE_MS } from "@domain/evaluations"
import { withTracing } from "@repo/observability"
import { Data, Effect } from "effect"
import { getQueuePublisher } from "../clients.ts"

class ScheduleEvaluationOptimizationError extends Data.TaggedError("ScheduleEvaluationOptimizationError")<{
  readonly cause: unknown
}> {
  readonly httpStatus = 500
  get httpMessage() {
    return "Failed to schedule evaluation optimization"
  }
}

export const buildOptimizationDedupeKey = (evaluationId: string) => `evaluations:optimize:${evaluationId}`

// Publishes a throttled `evaluations:automaticOptimization` task so a full
// GEPA re-optimization kicks off at most once per 8h per evaluation. Uses
// `throttleMs` rather than `debounceMs` so repeated escalations do not push
// the fire time forward indefinitely — first escalation wins, subsequent ones
// within the window are dropped.
//
// Lives in `apps/workflows/src/activities` rather than inside the workflow
// body because Temporal's workflow sandbox forbids the I/O performed by the
// BullMQ publisher. The workflow invokes this activity instead of publishing
// directly.
export const scheduleEvaluationOptimization = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
  readonly evaluationId: string
}): Promise<void> => {
  const publisher = await getQueuePublisher()

  return Effect.runPromise(
    publisher
      .publish(
        "evaluations",
        "automaticOptimization",
        {
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueId: input.issueId,
          evaluationId: input.evaluationId,
        },
        {
          dedupeKey: buildOptimizationDedupeKey(input.evaluationId),
          throttleMs: ALIGNMENT_FULL_REOPTIMIZE_THROTTLE_MS,
        },
      )
      .pipe(
        withTracing,
        Effect.mapError((cause) => new ScheduleEvaluationOptimizationError({ cause })),
      ),
  )
}
