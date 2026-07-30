import type { OrganizationId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import {
  type AgentDispatchKind,
  type StoredAgentDispatchTarget,
  storedAgentDispatchTargetSchema,
} from "../entities/agent-dispatch-config.ts"
import type { AgentDispatchTrigger } from "../entities/agent-dispatch-context.ts"
import {
  AgentDispatchConfigRepository,
  AgentDispatchCredentialRepository,
  AgentDispatchIntegrationRepository,
} from "../ports/repositories.ts"
import { upsertOrgDefaultDispatchConfigUseCase } from "./upsert-org-default-dispatch-config.ts"

export interface ConnectAgentDispatchIntegrationInput {
  readonly kind: AgentDispatchKind
  readonly vendorAccountId: string
  readonly installedByUserId: string
  readonly organizationId: OrganizationId
  readonly target: StoredAgentDispatchTarget
  readonly triggers: readonly AgentDispatchTrigger[]
  readonly cursorApiKey?: string | null
  readonly claudeRoutineToken?: string | null
  readonly linearApiKey?: string | null
  readonly webhookSecret?: string | null
}

/**
 * Connecting seeds the organization-wide default config, so every project can
 * dispatch to the integration. Existing triggers survive a reconnect, and the
 * incoming target is merged field-wise so omitted fields keep their value.
 */
export const connectAgentDispatchIntegrationUseCase = (input: ConnectAgentDispatchIntegrationInput) =>
  Effect.gen(function* () {
    const integrationRepo = yield* AgentDispatchIntegrationRepository
    const credentialRepo = yield* AgentDispatchCredentialRepository
    const configRepo = yield* AgentDispatchConfigRepository

    const existing = yield* integrationRepo.findActiveByKind(input.kind)
    const integration =
      existing ??
      (yield* integrationRepo.install({
        kind: input.kind,
        vendorAccountId: input.vendorAccountId,
        installedByUserId: input.installedByUserId,
      }))

    yield* credentialRepo.upsert({
      integrationId: integration.id,
      organizationId: input.organizationId,
      ...(input.cursorApiKey !== undefined ? { cursorApiKey: input.cursorApiKey } : {}),
      ...(input.claudeRoutineToken !== undefined ? { claudeRoutineToken: input.claudeRoutineToken } : {}),
      ...(input.linearApiKey !== undefined ? { linearApiKey: input.linearApiKey } : {}),
      ...(input.webhookSecret !== undefined ? { webhookSecret: input.webhookSecret } : {}),
    })

    const defaultConfig = yield* configRepo.findDefaultByIntegration(integration.id)
    const mergedTarget = storedAgentDispatchTargetSchema.safeParse({
      ...(defaultConfig?.target ?? {}),
      ...input.target,
    })
    const triggers = defaultConfig?.triggers ?? input.triggers

    yield* upsertOrgDefaultDispatchConfigUseCase({
      organizationId: input.organizationId,
      integrationId: integration.id,
      kind: input.kind,
      enabled: defaultConfig?.enabled ?? triggers.length > 0,
      triggers,
      target: mergedTarget.success ? mergedTarget.data : input.target,
    })

    return integration
  }).pipe(Effect.withSpan("agentDispatch.connectIntegration")) as Effect.Effect<
    import("../ports/repositories.ts").AgentDispatchIntegration,
    unknown,
    AgentDispatchIntegrationRepository | AgentDispatchCredentialRepository | AgentDispatchConfigRepository | SqlClient
  >
