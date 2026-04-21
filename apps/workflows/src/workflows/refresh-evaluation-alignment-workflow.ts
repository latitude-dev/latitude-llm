import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

type RefreshEvaluationAlignmentWorkflowInput = {
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
  readonly evaluationId: string
}

export type RefreshEvaluationAlignmentWorkflowResult =
  | { readonly status: "inactive" }
  | {
      readonly status: "metric-only"
      readonly newExampleCount: number
    }
  | {
      readonly status: "no-op"
      readonly newExampleCount: number
    }
  | {
      readonly status: "escalated-to-optimization"
      readonly newExampleCount: number
    }

const {
  collectEvaluationAlignmentExamples,
  evaluateIncrementalEvaluationDraft,
  loadEvaluationAlignmentStateOrInactive,
  persistEvaluationAlignmentResult,
  scheduleEvaluationOptimization,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: defaultActivityRetryPolicy,
})

// Linear: load state (exit on inactive) → collect new examples → run the
// incremental evaluator. On `metric-only`, persist the refreshed confusion
// matrix. On `full-reoptimization`, publish `evaluations:automaticOptimization`
// via the schedule activity and exit without persisting — the optimization
// workflow owns the next script write. On `no-op`, exit.
//
// Scheduling is intentionally outside this workflow: the queue owns the 1h
// debounce before this workflow starts, and the 8h debounce before the
// optimization workflow starts.
export const refreshEvaluationAlignmentWorkflow = async (
  input: RefreshEvaluationAlignmentWorkflowInput,
): Promise<RefreshEvaluationAlignmentWorkflowResult> => {
  const loaded = await loadEvaluationAlignmentStateOrInactive({
    organizationId: input.organizationId,
    projectId: input.projectId,
    issueId: input.issueId,
    evaluationId: input.evaluationId,
  })

  if (loaded.status === "inactive") {
    return { status: "inactive" }
  }

  const state = loaded.state

  const collected = await collectEvaluationAlignmentExamples({
    organizationId: input.organizationId,
    projectId: input.projectId,
    issueId: input.issueId,
    createdAfter: state.alignedAt,
    requirePositiveExamples: false,
  })

  const refresh = await evaluateIncrementalEvaluationDraft({
    organizationId: input.organizationId,
    projectId: input.projectId,
    issueId: input.issueId,
    evaluationId: state.evaluationId,
    issueName: state.issueName,
    issueDescription: state.issueDescription,
    draft: state.draft,
    previousConfusionMatrix: state.confusionMatrix,
    positiveExamples: collected.positiveExamples,
    negativeExamples: collected.negativeExamples,
  })

  if (refresh.strategy === "metric-only") {
    await persistEvaluationAlignmentResult({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      evaluationId: state.evaluationId,
      script: state.draft.script,
      evaluationHash: state.draft.evaluationHash,
      confusionMatrix: refresh.nextConfusionMatrix,
      trigger: state.draft.trigger,
      name: state.name,
      description: state.description,
    })
    return { status: "metric-only", newExampleCount: refresh.newExampleCount }
  }

  if (refresh.strategy === "full-reoptimization") {
    await scheduleEvaluationOptimization({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      evaluationId: state.evaluationId,
    })
    return { status: "escalated-to-optimization", newExampleCount: refresh.newExampleCount }
  }

  return { status: "no-op", newExampleCount: refresh.newExampleCount }
}
