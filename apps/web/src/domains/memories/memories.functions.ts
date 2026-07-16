import { computeSessionMemorySummaryUseCase, type SessionMemorySummary } from "@domain/memories"
import { ProjectId, SessionId, TraceId } from "@domain/shared"
import { MemoryRepositoryLive } from "@platform/db-clickhouse"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { getClickhouseClient } from "../../server/clients.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedClickHouse } from "../../server/scoped-clickhouse.ts"

export type SessionMemorySummaryRecord = SessionMemorySummary

/**
 * A session's (or one trace's) memory footprint for the summary chip. No cache
 * in v1 — the read rides the `memory_events` session bloom filter plus a single
 * batched blob fetch.
 */
export const getSessionMemorySummary = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), sessionId: z.string(), traceId: z.string().optional() }))
  .handler(async ({ data, context }): Promise<SessionMemorySummaryRecord> => {
    const orgId = await resolveOrgScope(context)

    return Effect.runPromise(
      computeSessionMemorySummaryUseCase({
        organizationId: orgId,
        projectId: ProjectId(data.projectId),
        sessionId: SessionId(data.sessionId),
        ...(data.traceId ? { traceId: TraceId(data.traceId) } : {}),
      }).pipe(withScopedClickHouse(MemoryRepositoryLive, getClickhouseClient(), orgId), withTracing),
    )
  })
