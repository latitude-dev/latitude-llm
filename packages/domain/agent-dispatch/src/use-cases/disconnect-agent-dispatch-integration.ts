import type { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { AgentDispatchCredentialRepository, AgentDispatchIntegrationRepository } from "../ports/repositories.ts"

export const disconnectAgentDispatchIntegrationUseCase = (input: { readonly integrationId: string }) =>
  Effect.gen(function* () {
    const integrationRepo = yield* AgentDispatchIntegrationRepository
    const credentialRepo = yield* AgentDispatchCredentialRepository
    yield* integrationRepo.revoke(input.integrationId)
    yield* credentialRepo.delete(input.integrationId)
  }).pipe(Effect.withSpan("agentDispatch.disconnectIntegration")) as Effect.Effect<
    void,
    unknown,
    AgentDispatchIntegrationRepository | AgentDispatchCredentialRepository | SqlClient
  >
