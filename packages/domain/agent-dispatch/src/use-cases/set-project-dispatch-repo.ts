import type { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { type AgentDispatchConfigRow, storedCursorDispatchTargetSchema } from "../entities/agent-dispatch-config.ts"
import { AgentDispatchConfigRepository } from "../ports/repositories.ts"
import { upsertProjectDispatchOverrideUseCase } from "./upsert-project-dispatch-override.ts"

/**
 * Sets the cursor repo for one project from the send-time prompt. The override
 * target snapshots the effective target plus the repo, so the atomic
 * whole-field override semantics still resolve a complete target afterwards.
 */
export const setProjectDispatchRepoUseCase = (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly integrationId: string
  readonly repoUrl: string
}) =>
  Effect.gen(function* () {
    const configRepo = yield* AgentDispatchConfigRepository
    const [defaultConfig, override] = yield* Effect.all([
      configRepo.findDefaultByIntegration(input.integrationId),
      configRepo.findOverrideByProjectAndIntegration({
        projectId: input.projectId,
        integrationId: input.integrationId,
      }),
    ])
    const effectiveTarget = storedCursorDispatchTargetSchema.safeParse(override?.target ?? defaultConfig?.target ?? {})

    return yield* upsertProjectDispatchOverrideUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      integrationId: input.integrationId,
      kind: "cursor",
      target: { ...(effectiveTarget.success ? effectiveTarget.data : {}), repoUrl: input.repoUrl },
    })
  }).pipe(Effect.withSpan("agentDispatch.setProjectRepo")) as Effect.Effect<
    AgentDispatchConfigRow,
    unknown,
    AgentDispatchConfigRepository | SqlClient
  >
