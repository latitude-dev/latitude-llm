function input<T extends Record<string, unknown>>(): T {
  return {} as T
}

const _registry = {
  analyzeSessionWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly sessionId: string
    readonly triggeringTraceId: string
    readonly triggeringStartTime: string
    readonly reason: "trace_completed" | "backfill" | "manual_reprocess"
    readonly debounceMs?: number
  }>(),
  backfillSessionIntelligenceWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly sessionLimit: number
    readonly reason: "backoffice"
  }>(),
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
    readonly billingOperationId: string
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
  billingOverageWorkflow: input<{
    readonly organizationId: string
    readonly periodStart: string
    readonly periodEnd: string
    readonly snapshotOverageCredits: number
  }>(),
  flaggerWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly traceId: string
    readonly flaggerId: string
    readonly flaggerSlug: string
  }>(),
  seedDemoProjectWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly queueAssigneeUserIds: readonly string[]
    readonly apiKeyId: string
    readonly timelineAnchorIso: string
  }>(),
  gardenTaxonomyWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly dimension: "topic"
    readonly trigger: "cron" | "manual" | "threshold"
  }>(),
}

export type WorkflowRegistry = typeof _registry
export const WORKFLOW_NAMES = Object.keys(_registry) as (keyof WorkflowRegistry & string)[]
