import { generateId, type OrganizationId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { DEFAULT_COOLDOWN_MINUTES, DEFAULT_MAX_DISPATCHES_PER_DAY } from "../constants.ts"
import type {
  AgentDispatchConfigRow,
  AgentDispatchGuardrails,
  AgentDispatchKind,
  StoredAgentDispatchTarget,
} from "../entities/agent-dispatch-config.ts"
import type { AgentDispatchTrigger } from "../entities/agent-dispatch-context.ts"
import { AgentDispatchConfigRepository } from "../ports/repositories.ts"

export interface UpsertOrgDefaultDispatchConfigInput {
  readonly organizationId: OrganizationId
  readonly integrationId: string
  readonly kind: AgentDispatchKind
  readonly enabled: boolean
  readonly triggers: readonly AgentDispatchTrigger[]
  readonly target: StoredAgentDispatchTarget
  readonly promptTemplate?: string | null
  readonly guardrails?: AgentDispatchGuardrails
}

export const upsertOrgDefaultDispatchConfigUseCase = (input: UpsertOrgDefaultDispatchConfigInput) =>
  Effect.gen(function* () {
    const configRepo = yield* AgentDispatchConfigRepository
    const existing = yield* configRepo.findDefaultByIntegration(input.integrationId)

    const now = new Date()
    const config: AgentDispatchConfigRow = {
      id: existing?.id ?? generateId(),
      organizationId: input.organizationId,
      projectId: null,
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
  }).pipe(Effect.withSpan("agentDispatch.upsertOrgDefaultConfig")) as Effect.Effect<
    AgentDispatchConfigRow,
    unknown,
    AgentDispatchConfigRepository | SqlClient
  >
