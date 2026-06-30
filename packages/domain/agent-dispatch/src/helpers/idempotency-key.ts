import type { AgentDispatchKind } from "../entities/agent-dispatch-config.ts"
import type { AgentDispatchTrigger } from "../entities/agent-dispatch-context.ts"

export const buildDispatchIdempotencyKey = (input: {
  readonly vendor: AgentDispatchKind
  readonly trigger: AgentDispatchTrigger
  readonly sourceId: string
}): string => `${input.vendor}:${input.trigger}:${input.sourceId}`
