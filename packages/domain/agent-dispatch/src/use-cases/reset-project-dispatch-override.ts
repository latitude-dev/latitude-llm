import type { ProjectId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { AgentDispatchConfigRepository } from "../ports/repositories.ts"

export const resetProjectDispatchOverrideUseCase = (input: {
  readonly projectId: ProjectId
  readonly integrationId: string
}) =>
  Effect.gen(function* () {
    const configRepo = yield* AgentDispatchConfigRepository
    const existing = yield* configRepo.findOverrideByProjectAndIntegration(input)
    if (existing) yield* configRepo.delete(existing.id)
  }).pipe(Effect.withSpan("agentDispatch.resetProjectOverride")) as Effect.Effect<
    void,
    unknown,
    AgentDispatchConfigRepository | SqlClient
  >
