// Cross-process contract for the evaluation alignment Temporal workflow.
// The workflow definition lives in `apps/workflows`, but its signal name,
// query name, and query response shape are shared with `apps/workers`
// (auto-refresh) and `apps/web` (manual triggers + polling). Keeping them
// here means all three apps reference the same strings/types instead of
// maintaining parallel copies that can silently drift.
//
// Workflow IDs use the format `evaluations:alignment:${issueId|evaluationId}`
// and are inlined at each call site.

export const EVALUATION_ALIGNMENT_REFRESH_SIGNAL = "scheduleRefresh"

export const EVALUATION_ALIGNMENT_STATE_QUERY = "getEvaluationAlignmentWorkflowState"

export type EvaluationAlignmentWorkflowState = {
  readonly manualRealignment: {
    readonly isBusy: boolean
    readonly currentJobId: string | null
  }
}
