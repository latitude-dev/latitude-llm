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
  | {
      readonly status: "full-metric-rebuild"
      readonly totalExampleCount: number
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

const { evaluateBaselineEvaluationDraft, evaluateIncrementalEvaluationDraft } = proxyActivities<typeof activities>({
  // Runs the evaluation script plus an LLM judge per example. Incremental runs
  // are bounded by annotations since the last alignment; full rebuilds are
  // bounded by the curated dataset size (up to 100). Either can be heavy.
  startToCloseTimeout: "2 hours",
  retry: defaultActivityRetryPolicy,
})

// Linear: load state (exit on inactive) → branch on hash.
//
// When `sha1(evaluation.script) === evaluation.alignment.evaluationHash`, the
// stored confusion matrix was produced by the script that is live now, so we
// only need to judge the new examples and merge their results in. From there
// `metric-only` persists the refreshed matrix, `full-reoptimization` escalates
// onto the 8h-throttled optimize workflow, and `no-op` exits.
//
// When the hashes diverge, `evaluation.script` was updated without going
// through `persistAlignmentResultUseCase`, so the persisted matrix reflects a
// different script and incremental merging would mix judgments from two
// scripts. Rebuild the matrix from scratch against every curated example,
// then persist with the freshly computed hash so future refreshes are back
// in the incremental-eligible path. This rebuild does not trigger GEPA —
// that only runs on MCC drop, which we can evaluate again on the next pass.
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

  if (!loaded.incrementalEligible) {
    const collected = await collectEvaluationAlignmentExamples({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      // `collectAlignmentExamplesUseCase` throws when there are no positive
      // examples unless this flag is explicitly false. A rebuild triggered
      // purely by hash drift (say, every positive annotation was deleted
      // since the last alignment) is a legitimate reason to land with zero
      // examples: the baseline evaluator against an empty dataset yields
      // an empty matrix, which we still want to persist so the refreshed
      // hash lands on the row and the next refresh is back on the
      // incremental-eligible path.
      requirePositiveExamples: false,
    })
    const baseline = await evaluateBaselineEvaluationDraft({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      evaluationId: state.evaluationId,
      jobId: `refresh-rebuild:${state.evaluationId}`,
      issueName: state.issueName,
      issueDescription: state.issueDescription,
      draft: state.draft,
      positiveExamples: collected.positiveExamples,
      negativeExamples: collected.negativeExamples,
    })
    await persistEvaluationAlignmentResult({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      evaluationId: state.evaluationId,
      script: state.draft.script,
      // Use the freshly computed hash so the persisted row is back in sync —
      // script, hash, and matrix once again describe the same evaluation.
      evaluationHash: loaded.currentScriptHash,
      confusionMatrix: baseline.confusionMatrix,
      trigger: state.draft.trigger,
      name: state.name,
      description: state.description,
    })
    return {
      status: "full-metric-rebuild",
      totalExampleCount: collected.positiveExamples.length + collected.negativeExamples.length,
    }
  }

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
