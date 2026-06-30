import { Context, type Effect } from "effect"
import type { AgentDispatchKind, ResolvedDispatchTarget } from "../entities/agent-dispatch-config.ts"
import type { AgentDispatchContext } from "../entities/agent-dispatch-context.ts"
import type { DispatchAdapterError } from "../errors.ts"

export interface DispatchResult {
  readonly externalAgentId?: string
  readonly externalRunId?: string
  readonly deepLinkUrl?: string
  readonly status: "accepted"
}

export interface DecryptedCredential {
  readonly cursorApiKey?: string
  readonly claudeRoutineToken?: string
  readonly linearApiKey?: string
  readonly webhookSecret?: string
}

export interface AgentDispatchAdapter {
  readonly kind: AgentDispatchKind
  readonly dispatch: (input: {
    readonly idempotencyKey: string
    readonly prompt: string
    readonly context: AgentDispatchContext
    readonly config: ResolvedDispatchTarget
    readonly credential: DecryptedCredential
  }) => Effect.Effect<DispatchResult, DispatchAdapterError, never>
}

export class AgentDispatchAdapters extends Context.Service<
  AgentDispatchAdapters,
  Readonly<Record<AgentDispatchKind, AgentDispatchAdapter>>
>()("@domain/agent-dispatch/AgentDispatchAdapters") {}
