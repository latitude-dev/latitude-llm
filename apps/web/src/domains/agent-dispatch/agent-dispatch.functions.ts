import { AGENT_DISPATCH_FLAG, AgentDispatchRepository } from "@domain/agent-dispatch"
import { hasFeatureFlagUseCase } from "@domain/feature-flags"
import { ProjectId } from "@domain/shared"
import { AgentDispatchRepositoryLive, FeatureFlagRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

export interface AgentDispatchRecord {
  readonly id: string
  readonly trigger: string
  readonly sourceType: string
  readonly sourceId: string
  readonly status: string
  readonly claimedAt: string
  readonly dispatchedAt: string | null
  readonly externalUrl: string | null
  readonly errorCategory: string | null
}

const toRecord = (row: {
  id: string
  trigger: string
  sourceType: string
  sourceId: string
  status: string
  claimedAt: Date
  dispatchedAt: Date | null
  externalUrl: string | null
  errorCategory: string | null
}): AgentDispatchRecord => ({
  id: row.id,
  trigger: row.trigger,
  sourceType: row.sourceType,
  sourceId: row.sourceId,
  status: row.status,
  claimedAt: row.claimedAt.toISOString(),
  dispatchedAt: row.dispatchedAt?.toISOString() ?? null,
  externalUrl: row.externalUrl,
  errorCategory: row.errorCategory,
})

export const isAgentDispatchEnabled = createServerFn({ method: "GET" }).handler(async () => {
  const { organizationId } = await requireSession()
  const enabled = await Effect.runPromise(
    hasFeatureFlagUseCase({ identifier: AGENT_DISPATCH_FLAG }).pipe(
      withPostgres(FeatureFlagRepositoryLive, getPostgresClient(), organizationId),
    ),
  )
  return { enabled }
})

export const listAgentDispatches = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const rows = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchRepository
        return yield* repo.listByProject(ProjectId(data.projectId))
      }).pipe(withPostgres(AgentDispatchRepositoryLive, getPostgresClient(), organizationId)),
    )
    return rows.map(toRecord)
  })
