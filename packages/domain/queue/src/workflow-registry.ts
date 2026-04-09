function input<T extends Record<string, unknown>>(): T {
  return {} as T
}

const _registry = {
  issueDiscoveryWorkflow: input<{
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
