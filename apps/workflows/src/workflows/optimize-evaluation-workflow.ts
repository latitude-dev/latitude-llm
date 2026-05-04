import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

type OptimizeEvaluationWorkflowInput = {
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
  readonly evaluationId: string | null
  readonly jobId: string
  readonly billingOperationId: string
}

export type OptimizeEvaluationWorkflowResult =
  | { readonly status: "inactive" }
  | { readonly status: "blocked"; readonly reason: "no-credits-remaining" }
  | {
      readonly status: "optimized"
      readonly evaluationId: string
      readonly positiveExampleCount: number
      readonly negativeExampleCount: number
    }

// Activities are grouped by expected duration so a stuck fast-path activity
// surfaces as a failure quickly while the GEPA optimization and full-dataset
// evaluation passes are not clipped mid-run. No activity heartbeats (grep
// confirms none exist), so Temporal can only detect a hang when the full
// `startToCloseTimeout` elapses.
const { checkEvaluationGenerationBilling, loadEvaluationAlignmentStateOrInactive, persistEvaluationAlignmentResult } =
  proxyActivities<typeof activities>({
    // Postgres reads/writes only.
    startToCloseTimeout: "1 minute",
    retry: defaultActivityRetryPolicy,
  })

const { collectEvaluationAlignmentExamples, generateBaselineEvaluationDraft } = proxyActivities<typeof activities>({
  // Example collection plus a single-shot LLM call for the baseline script.
  startToCloseTimeout: "10 minutes",
  retry: defaultActivityRetryPolicy,
})

const { optimizeEvaluationDraft } = proxyActivities<typeof activities>({
  // GEPA optimization does many LLM round-trips. The Python engine is bounded
  // by `GEPA_MAX_TIME` (1 hour) but only checks its stop conditions between
  // full iterations, so the activity gets a 1.25x buffer over the engine
  // budget to avoid clipping a run that is finishing its current iteration
  // when the budget elapses. Keep this in sync with `GEPA_MAX_TIME` in
  // `@platform/op-gepa`.
  startToCloseTimeout: "75 minutes",
  retry: defaultActivityRetryPolicy,
})

const { evaluateBaselineEvaluationDraft } = proxyActivities<typeof activities>({
  // The baseline evaluator runs the script plus an LLM judge across the full
  // curated dataset (up to 100 examples) and can legitimately take a long
  // time even after the optimization step is bounded.
  startToCloseTimeout: "1 hour",
  retry: defaultActivityRetryPolicy,
})

// Linear full-optimization pipeline. Serves three entry points with the same
// body:
//   - initial generation from an issue (`evaluationId === null`)
//   - manual realignment of an existing evaluation
//   - automatic re-optimization triggered by the throttled
//     `evaluations:automaticOptimization` queue task (8h, first-publish-wins)
//
// The evaluation's name/description are inherited from the linked Issue at
// persist time, so every run (create, manual realign, auto re-optimize) writes
// the current Issue values onto the evaluation row.
export const optimizeEvaluationWorkflow = async (
  input: OptimizeEvaluationWorkflowInput,
): Promise<OptimizeEvaluationWorkflowResult> => {
  if (input.evaluationId) {
    const existing = await loadEvaluationAlignmentStateOrInactive({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      evaluationId: input.evaluationId,
    })

    if (existing.status === "inactive") {
      return { status: "inactive" }
    }
  }

  const billingAllowed = await checkEvaluationGenerationBilling({
    organizationId: input.organizationId,
    projectId: input.projectId,
    evaluationId: input.evaluationId,
    billingOperationId: input.billingOperationId,
  })

  if (!billingAllowed) {
    return {
      status: "blocked",
      reason: "no-credits-remaining",
    }
  }

  const collected = await collectEvaluationAlignmentExamples({
    organizationId: input.organizationId,
    projectId: input.projectId,
    issueId: input.issueId,
  })

  const baselineDraft = await generateBaselineEvaluationDraft({
    jobId: input.jobId,
    issueName: collected.issueName,
    issueDescription: collected.issueDescription,
    positiveExamples: collected.positiveExamples,
    negativeExamples: collected.negativeExamples,
  })

  const optimizedDraft = await optimizeEvaluationDraft({
    organizationId: input.organizationId,
    projectId: input.projectId,
    issueId: input.issueId,
    evaluationId: input.evaluationId ?? null,
    jobId: input.jobId,
    draft: baselineDraft,
    issueName: collected.issueName,
    issueDescription: collected.issueDescription,
    positiveExamples: collected.positiveExamples,
    negativeExamples: collected.negativeExamples,
  })

  const baselineEvaluation = await evaluateBaselineEvaluationDraft({
    organizationId: input.organizationId,
    projectId: input.projectId,
    issueId: input.issueId,
    evaluationId: input.evaluationId ?? null,
    jobId: input.jobId,
    issueName: collected.issueName,
    issueDescription: collected.issueDescription,
    draft: optimizedDraft,
    positiveExamples: collected.positiveExamples,
    negativeExamples: collected.negativeExamples,
  })

  const persisted = await persistEvaluationAlignmentResult({
    organizationId: input.organizationId,
    projectId: input.projectId,
    issueId: input.issueId,
    evaluationId: input.evaluationId ?? null,
    script: optimizedDraft.script,
    evaluationHash: optimizedDraft.evaluationHash,
    confusionMatrix: baselineEvaluation.confusionMatrix,
    trigger: optimizedDraft.trigger,
  })

  return {
    status: "optimized",
    evaluationId: persisted.evaluationId,
    positiveExampleCount: collected.positiveExamples.length,
    negativeExampleCount: collected.negativeExamples.length,
  }
}
