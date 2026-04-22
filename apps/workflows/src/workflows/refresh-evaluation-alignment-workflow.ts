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

// Activities are grouped by expected duration so a stuck fast-path activity
// surfaces as a failure quickly while a legitimate long-running LLM pass is
// not clipped mid-run. No activity heartbeats (grep confirms none exist), so
// Temporal can only detect a hang when the full `startToCloseTimeout` elapses.
const { loadEvaluationAlignmentStateOrInactive, persistEvaluationAlignmentResult, scheduleEvaluationOptimization } =
  proxyActivities<typeof activities>({
    // Postgres reads/writes and a single queue publish.
    startToCloseTimeout: "1 minute",
    retry: defaultActivityRetryPolicy,
  })

const { collectEvaluationAlignmentExamples } = proxyActivities<typeof activities>({
  // Postgres + ClickHouse reads plus trace hydration for up to 100 examples.
  startToCloseTimeout: "10 minutes",
  retry: defaultActivityRetryPolicy,
})

const { evaluateIncrementalEvaluationDraft } = proxyActivities<typeof activities>({
  // Runs the evaluation script plus an LLM judge per newly annotated example;
  // bounded by annotations since the last alignment but can still be heavy.
  startToCloseTimeout: "2 hours",
  retry: defaultActivityRetryPolicy,
})

// Linear: load state (exit on inactive) → collect new examples → run the
// incremental evaluator. On `metric-only`, persist the refreshed confusion
// matrix. On `full-reoptimization`, publish `evaluations:automaticOptimization`
// via the schedule activity and exit without persisting — the optimization
// workflow owns the next script write. On `no-op`, exit.
//
// Scheduling is intentionally outside this workflow: the queue owns the 1h
// throttle before this workflow starts, and the 8h throttle before the
// optimization workflow starts. Both windows are first-publish-wins, so a
// continuous annotation stream cannot push the fire time forward indefinitely.
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
