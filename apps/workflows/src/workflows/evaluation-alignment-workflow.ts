// Imported from the `./constants` subpath instead of the main barrel because
// the Temporal workflow sandbox cannot load `@domain/evaluations`'s barrel:
// it re-exports `browser.ts` → `helpers.ts` → `@domain/shared` → `cache.ts`
// → `ServiceMap.Service`, whose constructor writes to `Error.stackTraceLimit`,
// which is forbidden in the workflow sandbox. The `./constants` subpath is a
// leaf module with no runtime dependencies, so it is safe to bundle here.
import {
  ALIGNMENT_FULL_REOPTIMIZE_DEBOUNCE_MS,
  ALIGNMENT_METRIC_RECOMPUTE_DEBOUNCE_MS,
  EVALUATION_ALIGNMENT_REFRESH_SIGNAL,
  EVALUATION_ALIGNMENT_STATE_QUERY,
  type EvaluationAlignmentWorkflowState,
} from "@domain/evaluations/constants"
import { condition, defineQuery, defineSignal, proxyActivities, setHandler } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

type EvaluationAlignmentWorkflowInput = {
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
  readonly jobId: string
  readonly evaluationId?: string | null
  readonly refreshLoop?: boolean
  readonly reason:
    | "initial-generation"
    | "manual-realignment"
    | "debounced-metric-refresh"
    | "debounced-full-realignment"
}

type ScheduleRefreshSignalInput = {
  readonly reason: "manual-realignment" | "debounced-metric-refresh" | "debounced-full-realignment"
  readonly jobId?: string | null
}

const scheduleRefreshSignal = defineSignal<[ScheduleRefreshSignalInput]>(EVALUATION_ALIGNMENT_REFRESH_SIGNAL)

const workflowStateQuery = defineQuery<EvaluationAlignmentWorkflowState>(EVALUATION_ALIGNMENT_STATE_QUERY)

const {
  collectEvaluationAlignmentExamples,
  evaluateIncrementalEvaluationDraft,
  evaluateBaselineEvaluationDraft,
  generateBaselineEvaluationDraft,
  generateEvaluationDetails,
  loadEvaluationAlignmentState,
  optimizeEvaluationDraft,
  persistEvaluationAlignmentResult,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: defaultActivityRetryPolicy,
})

const runFullAlignment = async (
  input: EvaluationAlignmentWorkflowInput,
): Promise<{
  readonly jobId: string
  readonly evaluationId: string
  readonly positiveExampleCount: number
  readonly negativeExampleCount: number
}> => {
  const existingState = input.evaluationId
    ? await loadEvaluationAlignmentState({
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        evaluationId: input.evaluationId,
      })
    : null

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
    jobId: input.jobId,
    evaluationId: persisted.evaluationId,
    positiveExampleCount: collected.positiveExamples.length,
    negativeExampleCount: collected.negativeExamples.length,
  }
}

const runIncrementalMetricRefresh = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
  readonly evaluationId: string
  readonly jobId: string
}): Promise<{
  readonly strategy: "no-op" | "metric-only" | "full-reoptimization"
  readonly evaluationId: string
  readonly newExampleCount: number
}> => {
  const state = await loadEvaluationAlignmentState({
    organizationId: input.organizationId,
    projectId: input.projectId,
    issueId: input.issueId,
    evaluationId: input.evaluationId,
  })
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
    jobId: input.jobId,
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
  }

  return {
    strategy: refresh.strategy,
    evaluationId: state.evaluationId,
    newExampleCount: refresh.newExampleCount,
  }
}

export const evaluationAlignmentWorkflow = async (input: EvaluationAlignmentWorkflowInput) => {
  if (!input.refreshLoop) {
    const result = await runFullAlignment(input)

    return result
  }

  if (!input.evaluationId) {
    throw new Error("Refresh-loop evaluation alignment requires an evaluationId")
  }

  let pendingMetricRefreshAtMs: number | null = null
  let pendingFullRealignmentAtMs: number | null = null
  let pendingManualJobId: string | null = null
  let currentManualJobId: string | null = null
  let scheduleRevision = 0

  const requestRefresh = (payload: ScheduleRefreshSignalInput) => {
    switch (payload.reason) {
      case "manual-realignment":
        pendingManualJobId = payload.jobId ?? input.jobId
        scheduleRevision += 1
        return
      case "debounced-full-realignment":
        if (pendingFullRealignmentAtMs === null) {
          pendingFullRealignmentAtMs = Date.now() + ALIGNMENT_FULL_REOPTIMIZE_DEBOUNCE_MS
          scheduleRevision += 1
        }
        return
      case "debounced-metric-refresh":
        if (pendingMetricRefreshAtMs === null) {
          pendingMetricRefreshAtMs = Date.now() + ALIGNMENT_METRIC_RECOMPUTE_DEBOUNCE_MS
          scheduleRevision += 1
        }

        if (pendingFullRealignmentAtMs === null) {
          pendingFullRealignmentAtMs = Date.now() + ALIGNMENT_FULL_REOPTIMIZE_DEBOUNCE_MS
          scheduleRevision += 1
        }
        return
    }
  }

  setHandler(scheduleRefreshSignal, (payload) => {
    requestRefresh(payload)
  })
  setHandler(
    workflowStateQuery,
    (): EvaluationAlignmentWorkflowState => ({
      manualRealignment: {
        isBusy: currentManualJobId !== null || pendingManualJobId !== null,
        currentJobId: currentManualJobId ?? pendingManualJobId,
      },
    }),
  )
  if (input.reason !== "initial-generation") {
    requestRefresh({
      reason: input.reason,
      jobId: input.jobId,
    })
  }

  for (;;) {
    const now = Date.now()

    if (pendingManualJobId !== null) {
      const manualJobId = pendingManualJobId
      pendingManualJobId = null
      currentManualJobId = manualJobId

      try {
        await runFullAlignment({
          ...input,
          jobId: manualJobId,
          reason: "manual-realignment",
        })
        pendingMetricRefreshAtMs = null
        pendingFullRealignmentAtMs = null
      } catch {
        // Keep the refresh loop alive; the workflow query exposes the final state.
      } finally {
        currentManualJobId = null
      }
      continue
    }

    if (pendingFullRealignmentAtMs !== null && pendingFullRealignmentAtMs <= now) {
      pendingFullRealignmentAtMs = null
      pendingMetricRefreshAtMs = null

      try {
        await runFullAlignment({
          ...input,
          reason: "debounced-full-realignment",
        })
      } catch {
        pendingFullRealignmentAtMs = Date.now() + ALIGNMENT_FULL_REOPTIMIZE_DEBOUNCE_MS
      }
      continue
    }

    if (pendingMetricRefreshAtMs !== null && pendingMetricRefreshAtMs <= now) {
      pendingMetricRefreshAtMs = null

      try {
        const result = await runIncrementalMetricRefresh({
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueId: input.issueId,
          evaluationId: input.evaluationId,
          jobId: input.jobId,
        })

        if (result.strategy === "full-reoptimization") {
          pendingFullRealignmentAtMs = Date.now()
        }
      } catch {
        pendingMetricRefreshAtMs = Date.now() + ALIGNMENT_METRIC_RECOMPUTE_DEBOUNCE_MS
      }
      continue
    }

    const nextDueAtMs =
      pendingMetricRefreshAtMs === null
        ? pendingFullRealignmentAtMs
        : pendingFullRealignmentAtMs === null
          ? pendingMetricRefreshAtMs
          : Math.min(pendingMetricRefreshAtMs, pendingFullRealignmentAtMs)
    const currentRevision = scheduleRevision

    if (nextDueAtMs === null) {
      return
    }

    await condition(
      () => scheduleRevision !== currentRevision || pendingManualJobId !== null,
      Math.max(nextDueAtMs - Date.now(), 0),
    )
  }
}
