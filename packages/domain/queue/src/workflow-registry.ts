export const EVALUATION_ALIGNMENT_REFRESH_SIGNAL = "scheduleRefresh"

export const evaluationAlignmentJobWorkflowId = (jobId: string): string => `evaluation-alignment:job:${jobId}`

export const evaluationAlignmentRefreshWorkflowId = (evaluationId: string): string =>
  `evaluation-alignment:${evaluationId}`

function input<T extends Record<string, unknown>>(): T {
  return {} as T
}

const _registry = {
  evaluationAlignmentWorkflow: input<{
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
  }>(),
  issueDiscoveryWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly scoreId: string
  }>(),
  assignScoreToKnownIssueWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly scoreId: string
    readonly issueId: string
  }>(),
  publishAnnotationWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly scoreId: string
  }>(),
  systemQueueFlaggerWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly traceId: string
    readonly queueSlug: string
  }>(),
}

export type WorkflowRegistry = typeof _registry
export const WORKFLOW_NAMES = Object.keys(_registry) as (keyof WorkflowRegistry & string)[]
