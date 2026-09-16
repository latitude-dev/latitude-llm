import {
  type AgentScoreExplanation,
  type AgentScoreSnapshot,
  getAgentScoreExplanation,
  getLatestAgentScore,
  getLatestAgentScoreExplanation,
  LAUNCH_AGENT_SCORE_ARTIFACT,
  listAgentScoreHistory,
} from "@domain/agent-score"
import { ProjectId, type ScoreDimension } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import { AgentScoreSnapshotRepositoryLive } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { getPostgresClient, getQueuePublisher, getRedisClient } from "../../server/clients.ts"
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
  readonly createdAt: string
}

interface ProjectAgentScoreRecord {
  readonly available: boolean
  readonly date: string
  readonly snapshot: AgentScoreRecord | null
  readonly dimensionWeights: Readonly<Record<ScoreDimension, number>>
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
  createdAt: snapshot.createdAt.toISOString(),
})

const projectInput = z.object({ projectId: z.string() })
const AGENT_SCORE_REFRESH_THROTTLE_MS = 5 * 60_000

export const getProjectAgentScore = createServerFn({ method: "GET" })
  .inputValidator(projectInput)
  .handler(async ({ data, context }): Promise<ProjectAgentScoreRecord> => {
    const orgId = await resolveOrgScope(context)
    const latest = await Effect.runPromise(
      getLatestAgentScore({ organizationId: orgId, projectId: ProjectId(data.projectId) }).pipe(
        withScopedPostgres(AgentScoreSnapshotRepositoryLive, getPostgresClient(), orgId),
        withTracing,
      ),
    )

    return {
      available: latest.available,
      date: latest.date,
      snapshot: latest.available ? toRecord(latest.snapshot) : null,
      dimensionWeights: LAUNCH_AGENT_SCORE_ARTIFACT.compositeWeights,
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
  readonly currentExplanation: AgentScoreExplanation | null
}

/**
 * The cause rows, read from the cache the scoring worker warms.
 *
 * Separate from the score on purpose: the page renders its numbers from the snapshot immediately and
 * fills the explanation in when it arrives, because computing one means reading every session in the
 * window and that is not work a page load can wait on. The page's explicit refresh action can enqueue
 * that worker when the cache is missing or stale.
 */
export const getProjectAgentScoreExplanation = createServerFn({ method: "GET" })
  .inputValidator(projectInput)
  .handler(async ({ data, context }): Promise<AgentScoreExplanationRecord> => {
    const orgId = await resolveOrgScope(context)
    const projectId = ProjectId(data.projectId)
    const latest = await Effect.runPromise(
      getLatestAgentScore({ organizationId: orgId, projectId }).pipe(
        withScopedPostgres(AgentScoreSnapshotRepositoryLive, getPostgresClient(), orgId),
        withTracing,
      ),
    )
    const [currentResult, latestResult] = await Promise.all([
      Effect.runPromise(
        getAgentScoreExplanation({ organizationId: orgId, projectId, date: latest.date }).pipe(
          Effect.provide(RedisCacheStoreLive(getRedisClient())),
          withTracing,
        ),
      ),
      Effect.runPromise(
        getLatestAgentScoreExplanation({ organizationId: orgId, projectId }).pipe(
          Effect.provide(RedisCacheStoreLive(getRedisClient())),
          withTracing,
        ),
      ),
    ])

    return {
      status: latestResult.status,
      explanation: latestResult.status === "ready" ? latestResult.explanation : null,
      currentExplanation: currentResult.status === "ready" ? currentResult.explanation : null,
    }
  })

export const refreshProjectAgentScore = createServerFn({ method: "POST" })
  .inputValidator(projectInput)
  .handler(async ({ data, context }): Promise<{ enqueued: true; date: string }> => {
    const orgId = await resolveOrgScope(context)
    const publisher = await getQueuePublisher()
    const projectId = ProjectId(data.projectId)
    const date = new Date().toISOString().slice(0, 10)
    await Effect.runPromise(
      publisher
        .publish(
          "agent-score",
          "snapshotProject",
          {
            organizationId: orgId,
            projectId,
            date,
            force: true,
          },
          {
            dedupeKey: `org:${orgId}:agent-score:refresh:${projectId}:${date}`,
            leadingThrottleMs: AGENT_SCORE_REFRESH_THROTTLE_MS,
          },
        )
        .pipe(withTracing),
    )
    return { enqueued: true, date }
  })
