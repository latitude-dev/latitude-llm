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
  backfillRecentSessionIntelligenceWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly sessionLimit: number
    readonly startedAfter: string
    readonly sessionConcurrency?: number
    readonly gardenAfter?: boolean
  }>(),
  backfillRecentSessionIntelligenceForProjectsWorkflow: input<{
    readonly sessionLimitPerProject: number
    readonly lookbackDays?: number
    readonly startedAfter?: string
    readonly projectConcurrency?: number
    readonly sessionConcurrencyPerProject?: number
    readonly gardenAfter?: boolean
    readonly organizationId?: string
    readonly projectId?: string
  }>(),
  refreshEvaluationAlignmentWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly signalId: string
    readonly evaluationId: string
  }>(),
  optimizeEvaluationWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly signalId: string
    readonly evaluationId: string | null
    readonly jobId: string
    readonly billingOperationId: string
  }>(),
  signalDiscoveryWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly scoreId: string
  }>(),
  assignScoreToKnownSignalWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly scoreId: string
    readonly signalId: string
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
    readonly apiKeyId: string
    readonly timelineAnchorIso: string
  }>(),
  regenerateShowcaseWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly apiKeyId: string
    readonly timelineAnchorIso: string
  }>(),
  gardenTaxonomyWorkflow: input<{
    readonly organizationId: string
    readonly projectId: string
    readonly dimension: "topic"
    readonly trigger: "cron" | "manual" | "threshold"
    /** Present ⇒ a custom behavior's scoped sub-tree; absent ⇒ project-wide global gardening. */
    readonly customBehaviorId?: string
  }>(),
}

export type WorkflowRegistry = typeof _registry
export const WORKFLOW_NAMES = Object.keys(_registry) as (keyof WorkflowRegistry & string)[]
