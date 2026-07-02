import type { OrganizationId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { AgentDispatchKind } from "../entities/agent-dispatch-config.ts"
import { AgentDispatchCredentialRepository, AgentDispatchIntegrationRepository } from "../ports/repositories.ts"

export interface ConnectAgentDispatchIntegrationInput {
  readonly kind: AgentDispatchKind
  readonly vendorAccountId: string
  readonly installedByUserId: string
  readonly organizationId: OrganizationId
  readonly cursorApiKey?: string | null
  readonly claudeRoutineToken?: string | null
  readonly linearApiKey?: string | null
  readonly webhookSecret?: string | null
}

export const connectAgentDispatchIntegrationUseCase = (input: ConnectAgentDispatchIntegrationInput) =>
  Effect.gen(function* () {
    const integrationRepo = yield* AgentDispatchIntegrationRepository
    const credentialRepo = yield* AgentDispatchCredentialRepository

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

    return integration
  }).pipe(Effect.withSpan("agentDispatch.connectIntegration")) as Effect.Effect<
    import("../ports/repositories.ts").AgentDispatchIntegration,
    unknown,
    AgentDispatchIntegrationRepository | AgentDispatchCredentialRepository | SqlClient
  >
