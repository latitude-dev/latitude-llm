import {
  type AgentScoreExplanation,
  type AgentScoreSnapshot,
  getAgentScoreExplanation,
  getCurrentAgentScore,
  listAgentScoreHistory,
} from "@domain/agent-score"
import { ProjectId } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { AgentScoreSnapshotRepositoryLive } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { getPostgresClient, getRedisClient } from "../../server/clients.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedPostgres } from "../../server/scoped-postgres.ts"

export interface AgentScoreRecord {
  readonly date: string
  readonly score: number
  readonly interval: { readonly lower: number; readonly upper: number }
  readonly dimensions: Record<string, { readonly score: number; readonly interval: { lower: number; upper: number } }>
  readonly scoringVersion: string
  readonly windowDays: number
  readonly eligibleSessionCount: number
  readonly policyCap: number | null
}

interface CurrentAgentScoreRecord {
  readonly available: boolean
  readonly date: string
  readonly snapshot: AgentScoreRecord | null
}

const toRecord = (snapshot: AgentScoreSnapshot): AgentScoreRecord => ({
  date: snapshot.date,
  score: snapshot.score,
  interval: snapshot.interval,
  dimensions: snapshot.dimensions,
  scoringVersion: snapshot.scoringVersion,
  windowDays: snapshot.windowDays,
  eligibleSessionCount: snapshot.eligibleSessionCount,
  policyCap: snapshot.policyCap ?? null,
})

const projectInput = z.object({ projectId: z.string() })

export const getProjectAgentScore = createServerFn({ method: "GET" })
  .inputValidator(projectInput)
  .handler(async ({ data, context }): Promise<CurrentAgentScoreRecord> => {
    const orgId = await resolveOrgScope(context)
    const current = await Effect.runPromise(
      getCurrentAgentScore({ organizationId: orgId, projectId: ProjectId(data.projectId) }).pipe(
        withScopedPostgres(AgentScoreSnapshotRepositoryLive, getPostgresClient(), orgId),
        withTracing,
      ),
    )

    return {
      available: current.available,
      date: current.date,
      snapshot: current.available ? toRecord(current.snapshot) : null,
    }
  })

export const getProjectAgentScoreHistory = createServerFn({ method: "GET" })
  .inputValidator(projectInput)
  .handler(async ({ data, context }): Promise<readonly AgentScoreRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const snapshots = await Effect.runPromise(
      listAgentScoreHistory({ organizationId: orgId, projectId: ProjectId(data.projectId) }).pipe(
        withScopedPostgres(AgentScoreSnapshotRepositoryLive, getPostgresClient(), orgId),
        withTracing,
      ),
    )

    return snapshots.map(toRecord)
  })

export interface AgentScoreExplanationRecord {
  readonly status: "ready" | "notComputed"
  readonly explanation: AgentScoreExplanation | null
}

/**
 * The cause rows, read from the cache the daily job warms.
 *
 * Separate from the score on purpose: the page renders its numbers from the snapshot immediately and
 * fills the explanation in when it arrives, because computing one means reading every session in the
 * window and that is not work a page load can wait on.
 */
export const getProjectAgentScoreExplanation = createServerFn({ method: "GET" })
  .inputValidator(projectInput)
  .handler(async ({ data, context }): Promise<AgentScoreExplanationRecord> => {
    const orgId = await resolveOrgScope(context)
    const result = await Effect.runPromise(
      getAgentScoreExplanation({ organizationId: orgId, projectId: ProjectId(data.projectId) }).pipe(
        Effect.provide(RedisCacheStoreLive(getRedisClient())),
        withTracing,
      ),
    )

    return {
      status: result.status,
      explanation: result.status === "ready" ? result.explanation : null,
    }
  })
