import { AdminFeatureFlagRepository, getProjectDetailsUseCase } from "@domain/admin"
import {
  type AgentScoreExplanation,
  type AgentScoreSnapshot,
  getAgentScoreExplanation,
  getLatestAgentScore,
  getLatestAgentScoreExplanation,
} from "@domain/agent-score"
import { OrganizationId, ProjectId, type ScoreDimension } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  AdminFeatureFlagRepositoryLive,
  AdminProjectRepositoryLive,
  AgentScoreSnapshotRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { adminMiddleware } from "../../server/admin-middleware.ts"
import { getAdminPostgresClient, getQueuePublisher, getRedisClient } from "../../server/clients.ts"

/** Exported for input-schema tests. */
export const adminAgentScoreProjectInputSchema = z.object({
  projectId: z.string().min(1).max(256),
})

export interface AdminAgentScoreSnapshotDto {
  readonly date: string
  readonly score: number
  readonly interval: { readonly lower: number; readonly upper: number }
  readonly dimensions: Record<
    ScoreDimension,
    { readonly score: number; readonly interval: { readonly lower: number; readonly upper: number } }
  >
  readonly scoringVersion: string
  readonly windowDays: number
  readonly eligibleSessionCount: number
  readonly policyCap: number | null
  readonly createdAt: string
}

export interface AdminAgentScoreDto {
  readonly customerAccessEnabled: boolean
  readonly currentDate: string
  readonly snapshot: AdminAgentScoreSnapshotDto | null
  readonly explanation: AgentScoreExplanation | null
}

const toSnapshotDto = (snapshot: AgentScoreSnapshot): AdminAgentScoreSnapshotDto => ({
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

const agentScoreAdminLayers = Layer.mergeAll(
  AdminFeatureFlagRepositoryLive,
  AdminProjectRepositoryLive,
  AgentScoreSnapshotRepositoryLive,
)

/** Latest stored Agent Score for staff, independent of customer feature access. */
export const adminGetAgentScore = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(adminAgentScoreProjectInputSchema)
  .handler(async ({ data }): Promise<AdminAgentScoreDto> => {
    const cacheLayer = RedisCacheStoreLive(getRedisClient())
    return await Effect.runPromise(
      Effect.gen(function* () {
        const project = yield* getProjectDetailsUseCase({ projectId: ProjectId(data.projectId) })
        const organizationId = OrganizationId(project.organization.id)
        const [current, eligibility] = yield* Effect.all([
          getLatestAgentScore({ organizationId, projectId: ProjectId(project.id) }),
          Effect.gen(function* () {
            const featureFlags = yield* AdminFeatureFlagRepository
            return yield* featureFlags.findEligibilityForFlag("agentScore")
          }),
        ])
        const projectId = ProjectId(project.id)
        const latestExplanation = yield* getLatestAgentScoreExplanation({ organizationId, projectId }).pipe(
          Effect.provide(cacheLayer),
        )
        const datedExplanation = current.available
          ? yield* getAgentScoreExplanation({ organizationId, projectId, date: current.snapshot.date }).pipe(
              Effect.provide(cacheLayer),
            )
          : null
        const candidates = [
          datedExplanation?.status === "ready" ? datedExplanation.explanation : null,
          latestExplanation.status === "ready" ? latestExplanation.explanation : null,
        ]
        const explanation = current.available
          ? (candidates.find(
              (candidate) =>
                candidate?.organizationId === organizationId &&
                candidate.projectId === projectId &&
                candidate.date === current.snapshot.date &&
                candidate.scoringVersion === current.snapshot.scoringVersion,
            ) ?? null)
          : (candidates.find(
              (candidate) => candidate?.organizationId === organizationId && candidate.projectId === projectId,
            ) ?? null)

        return {
          customerAccessEnabled: eligibility.enabledForAll || eligibility.organizationIds.includes(organizationId),
          currentDate: current.date,
          snapshot: current.available ? toSnapshotDto(current.snapshot) : null,
          explanation,
        }
      }).pipe(withPostgres(agentScoreAdminLayers, getAdminPostgresClient()), withTracing),
    )
  })

export const agentScoreRecalculationDates = ({
  currentDate,
  snapshotDate,
}: {
  readonly currentDate: string
  readonly snapshotDate: string | null
}): readonly string[] => (snapshotDate && snapshotDate !== currentDate ? [currentDate, snapshotDate] : [currentDate])

/**
 * Recompute one project's Agent Score now, without waiting for the daily sweep.
 *
 * Today's date is always enqueued. When the latest published snapshot is older, that date is also
 * enqueued so the evidence shown beside the snapshot is actually refreshed. The runs are forced
 * because the expensive half of the work is the explanation — every session in the window, read
 * with its content — and this is how staff refresh it after a detector, a signal or a flagger
 * setting changes, rather than waiting a day to see the effect.
 *
 * It cannot rewrite a published score. The worker's insert is conditional on the date being absent,
 * so a forced run on a scored day refreshes the evidence and leaves the number exactly as it was:
 * a stored score records what was published that day, and staff curiosity is not a reason to edit
 * history. A day with no score can still gain one, which is the useful case after a backfill.
 *
 * The organization comes from the project lookup rather than the caller, so a request cannot name a
 * tenant it has nothing to do with.
 */
export const adminRecalculateAgentScore = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminAgentScoreProjectInputSchema)
  .handler(async ({ data }): Promise<{ enqueued: true; date: string }> => {
    const { project, latest } = await Effect.runPromise(
      Effect.gen(function* () {
        const project = yield* getProjectDetailsUseCase({ projectId: ProjectId(data.projectId) })
        const latest = yield* getLatestAgentScore({
          organizationId: OrganizationId(project.organization.id),
          projectId: ProjectId(project.id),
        })
        return { project, latest }
      }).pipe(
        withPostgres(
          Layer.mergeAll(AdminProjectRepositoryLive, AgentScoreSnapshotRepositoryLive),
          getAdminPostgresClient(),
        ),
        withTracing,
      ),
    )

    const date = new Date().toISOString().slice(0, 10)
    const dates = agentScoreRecalculationDates({
      currentDate: date,
      snapshotDate: latest.available ? latest.snapshot.date : null,
    })
    const publisher = await getQueuePublisher()
    await Effect.runPromise(
      Effect.forEach(
        dates,
        (taskDate) =>
          publisher.publish("agent-score", "snapshotProject", {
            organizationId: project.organization.id,
            projectId: project.id,
            date: taskDate,
            force: true,
          }),
        { discard: true },
      ).pipe(withTracing),
    )

    return { enqueued: true, date }
  })
