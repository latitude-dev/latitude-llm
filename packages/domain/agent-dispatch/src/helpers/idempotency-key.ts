import type { AgentDispatchKind } from "../entities/agent-dispatch-config.ts"
import type { AgentDispatchTrigger } from "../entities/agent-dispatch-context.ts"

export const buildDispatchIdempotencyKey = (input: {
  readonly vendor: AgentDispatchKind
  readonly configId: string
  readonly trigger: AgentDispatchTrigger
  readonly sourceId: string
  readonly dispatchWindow: string
}): string => `${input.vendor}:${input.configId}:${input.trigger}:${input.sourceId}:${input.dispatchWindow}`
