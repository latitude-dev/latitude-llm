import type { AgentDispatchKind } from "../entities/agent-dispatch-config.ts"
import type { AgentDispatchTrigger } from "../entities/agent-dispatch-context.ts"

export const buildDispatchIdempotencyKey = (input: {
  readonly vendor: AgentDispatchKind
  readonly configId: string
  readonly trigger: AgentDispatchTrigger
  readonly sourceId: string
  readonly dispatchWindow: string
}): string => `${input.vendor}:${input.configId}:${input.trigger}:${input.sourceId}:${input.dispatchWindow}`

// Each user click mints a new sendId, so deliberate re-sends dispatch again while
// double-submits of one click dedupe on the ledger's unique idempotency key.
export const buildManualDispatchIdempotencyKey = (input: {
  readonly vendor: AgentDispatchKind
  readonly configId: string
  readonly sourceId: string
  readonly sendId: string
}): string => `${input.vendor}:${input.configId}:manual:${input.sourceId}:${input.sendId}`
