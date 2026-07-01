import { generateId, type OrganizationId, type ProjectId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { DEFAULT_COOLDOWN_MINUTES, DEFAULT_MAX_DISPATCHES_PER_DAY } from "../constants.ts"
import type {
  AgentDispatchConfig,
  AgentDispatchGuardrails,
  AgentDispatchKind,
  AgentDispatchTarget,
} from "../entities/agent-dispatch-config.ts"
import type { AgentDispatchTrigger } from "../entities/agent-dispatch-context.ts"
import { AgentDispatchConfigRepository } from "../ports/repositories.ts"

export interface UpsertAgentDispatchConfigInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly integrationId: string
  readonly kind: AgentDispatchKind
  readonly enabled: boolean
  readonly triggers: readonly AgentDispatchTrigger[]
  readonly target: AgentDispatchTarget
  readonly promptTemplate?: string | null
  readonly guardrails?: AgentDispatchGuardrails
}

export const upsertAgentDispatchConfigUseCase = (input: UpsertAgentDispatchConfigInput) =>
  Effect.gen(function* () {
    const configRepo = yield* AgentDispatchConfigRepository
    const existing = yield* configRepo.findByProjectAndIntegration({
      projectId: input.projectId,
      integrationId: input.integrationId,
    })

    const now = new Date()
    const config: AgentDispatchConfig = {
      id: existing?.id ?? generateId(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      integrationId: input.integrationId,
      kind: input.kind,
      enabled: input.enabled,
      triggers: [...input.triggers],
      target: input.target,
      promptTemplate: input.promptTemplate ?? existing?.promptTemplate ?? null,
      guardrails: input.guardrails ??
        existing?.guardrails ?? {
          maxDispatchesPerDay: DEFAULT_MAX_DISPATCHES_PER_DAY,
          cooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
        },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    return yield* configRepo.upsert(config)
  }).pipe(Effect.withSpan("agentDispatch.upsertConfig")) as Effect.Effect<
    AgentDispatchConfig,
    unknown,
    AgentDispatchConfigRepository | SqlClient
  >
