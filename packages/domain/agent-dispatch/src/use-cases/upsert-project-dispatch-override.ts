import { generateId, type OrganizationId, type ProjectId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type {
  AgentDispatchConfigRow,
  AgentDispatchGuardrails,
  AgentDispatchKind,
  StoredAgentDispatchTarget,
} from "../entities/agent-dispatch-config.ts"
import type { AgentDispatchTrigger } from "../entities/agent-dispatch-context.ts"
import { AgentDispatchConfigRepository } from "../ports/repositories.ts"

/** Overridable fields: undefined keeps the stored value, null sets "inherit". */
export interface UpsertProjectDispatchOverrideInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly integrationId: string
  readonly kind: AgentDispatchKind
  readonly enabled?: boolean | null
  readonly triggers?: readonly AgentDispatchTrigger[] | null
  readonly target?: StoredAgentDispatchTarget | null
  readonly promptTemplate?: string | null
  readonly guardrails?: AgentDispatchGuardrails | null
}

export const upsertProjectDispatchOverrideUseCase = (input: UpsertProjectDispatchOverrideInput) =>
  Effect.gen(function* () {
    const configRepo = yield* AgentDispatchConfigRepository
    const existing = yield* configRepo.findOverrideByProjectAndIntegration({
      projectId: input.projectId,
      integrationId: input.integrationId,
    })

    const now = new Date()
    const config: AgentDispatchConfigRow = {
      id: existing?.id ?? generateId(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      integrationId: input.integrationId,
      kind: input.kind,
      enabled: input.enabled !== undefined ? input.enabled : (existing?.enabled ?? null),
      triggers:
        input.triggers !== undefined ? (input.triggers ? [...input.triggers] : null) : (existing?.triggers ?? null),
      target: input.target !== undefined ? input.target : (existing?.target ?? null),
      promptTemplate: input.promptTemplate !== undefined ? input.promptTemplate : (existing?.promptTemplate ?? null),
      guardrails: input.guardrails !== undefined ? input.guardrails : (existing?.guardrails ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    return yield* configRepo.upsert(config)
  }).pipe(Effect.withSpan("agentDispatch.upsertProjectOverride")) as Effect.Effect<
    AgentDispatchConfigRow,
    unknown,
    AgentDispatchConfigRepository | SqlClient
  >
