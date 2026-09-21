import {
  type AgentScoreExplanation,
  type AgentScoreSnapshot,
  agentScoreSnapshotWorkflowId,
  getAgentScoreExplanation,
  getAgentScoreForDate,
  getCurrentAgentScore,
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
import { getPostgresClient, getRedisClient, getWorkflowStarter } from "../../server/clients.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedPostgres } from "../../server/scoped-postgres.ts"
import { agentScoreDateSchema } from "./agent-score-date.ts"

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

const projectInput = z.object({ projectId: z.string(), date: agentScoreDateSchema.optional() })
const datedProjectInput = projectInput.extend({ date: agentScoreDateSchema })

export const getProjectAgentScore = createServerFn({ method: "GET" })
  .inputValidator(projectInput)
  .handler(async ({ data, context }): Promise<ProjectAgentScoreRecord> => {
    const orgId = await resolveOrgScope(context)
    const latest = await Effect.runPromise(
      getAgentScoreForDate({ organizationId: orgId, projectId: ProjectId(data.projectId), date: data.date }).pipe(
        withScopedPostgres(AgentScoreSnapshotRepositoryLive, getPostgresClient(), orgId),
        withTracing,
      ),
    )

    return {
      available: latest.available,
      date: latest.available ? latest.snapshot.date : latest.date,
      snapshot: latest.available ? toRecord(latest.snapshot) : null,
      dimensionWeights: LAUNCH_AGENT_SCORE_ARTIFACT.compositeWeights,
    }
  })

export const getProjectAgentScoreHistory = createServerFn({ method: "GET" })
  .inputValidator(datedProjectInput)
  .handler(async ({ data, context }): Promise<readonly AgentScoreRecord[]> => {
    const orgId = await resolveOrgScope(context)
    const snapshots = await Effect.runPromise(
      listAgentScoreHistory({ organizationId: orgId, projectId: ProjectId(data.projectId), to: data.date }).pipe(
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

export const getProjectAgentScoreExplanation = createServerFn({ method: "GET" })
  .inputValidator(datedProjectInput)
  .handler(async ({ data, context }): Promise<AgentScoreExplanationRecord> => {
    const orgId = await resolveOrgScope(context)
    const projectId = ProjectId(data.projectId)
    const result = await Effect.runPromise(
      getAgentScoreExplanation({ organizationId: orgId, projectId, date: data.date }).pipe(
        withScopedPostgres(AgentScoreSnapshotRepositoryLive, getPostgresClient(), orgId),
        Effect.provide(RedisCacheStoreLive(getRedisClient())),
        withTracing,
      ),
    )
    return { status: result.status, explanation: result.status === "ready" ? result.explanation : null }
  })

export const refreshProjectAgentScore = createServerFn({ method: "POST" })
  .inputValidator(datedProjectInput)
  .handler(async ({ data, context }): Promise<{ enqueued: boolean; date: string }> => {
    const orgId = await resolveOrgScope(context)
    const projectId = ProjectId(data.projectId)
    const current = await Effect.runPromise(
      getCurrentAgentScore({ organizationId: orgId, projectId, now: new Date(`${data.date}T00:00:00.000Z`) }).pipe(
        withScopedPostgres(AgentScoreSnapshotRepositoryLive, getPostgresClient(), orgId),
        withTracing,
      ),
    )
    if (current.available && current.snapshot.explanation) return { enqueued: false, date: data.date }
    const workflowStarter = await getWorkflowStarter()
    await Effect.runPromise(
      workflowStarter
        .start(
          "agentScoreSnapshotWorkflow",
          { organizationId: orgId, projectId, date: data.date, force: true },
          {
            workflowId: agentScoreSnapshotWorkflowId({
              organizationId: orgId,
              projectId,
              date: data.date,
              force: true,
            }),
          },
        )
        .pipe(
          Effect.catchTag("WorkflowAlreadyStartedError", () => Effect.void),
          withTracing,
        ),
    )
    return { enqueued: true, date: data.date }
  })
