function input<T extends Record<string, unknown>>(): T {
  return {} as T
}

const _registry = {
  refreshEvaluationAlignmentWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly issueId: string
    readonly evaluationId: string
  }>(),
  optimizeEvaluationWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly issueId: string
    readonly evaluationId: string | null
    readonly jobId: string
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
    readonly preEnrichedFeedback?: string
  }>(),
  flaggerWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly traceId: string
    readonly flaggerId: string
    readonly flaggerSlug: string
  }>(),
}

export type WorkflowRegistry = typeof _registry
export const WORKFLOW_NAMES = Object.keys(_registry) as (keyof WorkflowRegistry & string)[]
