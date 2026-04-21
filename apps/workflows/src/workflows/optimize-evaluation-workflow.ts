import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

type OptimizeEvaluationWorkflowInput = {
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
  readonly evaluationId: string | null
  readonly jobId: string
}

export type OptimizeEvaluationWorkflowResult =
  | { readonly status: "inactive" }
  | {
      readonly status: "optimized"
      readonly evaluationId: string
      readonly positiveExampleCount: number
      readonly negativeExampleCount: number
    }

const {
  collectEvaluationAlignmentExamples,
  evaluateBaselineEvaluationDraft,
  generateBaselineEvaluationDraft,
  generateEvaluationDetails,
  loadEvaluationAlignmentStateOrInactive,
  optimizeEvaluationDraft,
  persistEvaluationAlignmentResult,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: defaultActivityRetryPolicy,
})

// Linear full-optimization pipeline. Serves three entry points with the same
// body:
//   - initial generation from an issue (`evaluationId === null`)
//   - manual realignment of an existing evaluation
//   - automatic re-optimization triggered by the debounced
//     `evaluations:automaticOptimization` queue task
//
// For existing evaluations we skip the name/description generation pass and
// reuse the persisted values, so an auto-run does not silently rename a
// user-visible evaluation.
export const optimizeEvaluationWorkflow = async (
  input: OptimizeEvaluationWorkflowInput,
): Promise<OptimizeEvaluationWorkflowResult> => {
  const existing = input.evaluationId
    ? await loadEvaluationAlignmentStateOrInactive({
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        evaluationId: input.evaluationId,
      })
    : null

  if (existing?.status === "inactive") {
    return { status: "inactive" }
  }

  const existingState = existing?.status === "active" ? existing.state : null

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

  const details = existingState
    ? {
        name: existingState.name,
        description: existingState.description,
      }
    : await generateEvaluationDetails({
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        evaluationId: input.evaluationId ?? null,
        jobId: input.jobId,
        evaluationHash: optimizedDraft.evaluationHash,
        issueName: collected.issueName,
        issueDescription: collected.issueDescription,
        script: optimizedDraft.script,
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
    name: details.name,
    description: details.description,
  })

  return {
    status: "optimized",
    evaluationId: persisted.evaluationId,
    positiveExampleCount: collected.positiveExamples.length,
    negativeExampleCount: collected.negativeExamples.length,
  }
}
