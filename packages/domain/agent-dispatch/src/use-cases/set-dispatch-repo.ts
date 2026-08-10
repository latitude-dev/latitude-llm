import type { OrganizationId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { type AgentDispatchConfigRow, storedCursorDispatchTargetSchema } from "../entities/agent-dispatch-config.ts"
import { AgentDispatchConfigRepository } from "../ports/repositories.ts"
import { upsertOrgDefaultDispatchConfigUseCase } from "./upsert-org-default-dispatch-config.ts"

/** Sets the organization-wide cursor repo from the send-time prompt, keeping the rest of the target. */
export const setDispatchRepoUseCase = (input: {
  readonly organizationId: OrganizationId
  readonly integrationId: string
  readonly repoUrl: string
}) =>
  Effect.gen(function* () {
    const configRepo = yield* AgentDispatchConfigRepository
    const defaultConfig = yield* configRepo.findDefaultByIntegration(input.integrationId)
    const storedTarget = storedCursorDispatchTargetSchema.safeParse(defaultConfig?.target ?? {})

    return yield* upsertOrgDefaultDispatchConfigUseCase({
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      kind: "cursor",
      enabled: defaultConfig?.enabled ?? false,
      triggers: defaultConfig?.triggers ?? [],
      target: { ...(storedTarget.success ? storedTarget.data : {}), repoUrl: input.repoUrl },
    })
  }).pipe(Effect.withSpan("agentDispatch.setDispatchRepo")) as Effect.Effect<
    AgentDispatchConfigRow,
    unknown,
    AgentDispatchConfigRepository | SqlClient
  >
