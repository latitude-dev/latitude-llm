import { AdminFeatureFlagRepository, getProjectDetailsUseCase, seedAgentScoreHistoryUseCase } from "@domain/admin"
import {
  type AgentScoreExplanation,
  type AgentScoreSnapshot,
  agentScoreSnapshotWorkflowId,
  getAgentScoreExplanation,
  getLatestAgentScore,
  getLatestAgentScoreExplanation,
  LAUNCH_AGENT_SCORE_ARTIFACT,
  listAgentScoreHistory,
} from "@domain/agent-score"
import { OrganizationId, ProjectId, type ScoreDimension } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  AdminAgentScoreHistoryRepositoryLive,
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
import { getAdminPostgresClient, getRedisClient, getWorkflowStarter } from "../../server/clients.ts"

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

/**
 * One published day on the trend line.
 *
 * Deliberately thinner than the snapshot DTO: the backoffice trend draws a score per day and
 * captions the range, so shipping every dimension and interval for ninety days would multiply the
 * payload for pixels nobody reads. `scoringVersion` and `windowDays` stay because a line that
 * crosses either is not a continuous measurement and has to say so.
 */
export interface AdminAgentScoreHistoryPointDto {
  readonly date: string
  readonly score: number
  readonly scoringVersion: string
  readonly windowDays: number
  readonly eligibleSessionCount: number
}

export interface AdminAgentScoreDto {
  readonly customerAccessEnabled: boolean
  readonly currentDate: string
  readonly snapshot: AdminAgentScoreSnapshotDto | null
  readonly explanation: AgentScoreExplanation | null
  /** Published scores through today, oldest first. Unscored days are absent, not zero-filled. */
  readonly history: readonly AdminAgentScoreHistoryPointDto[]
  /** Composite weights, so the staff ring sizes each dimension arc exactly as the customer ring does. */
  readonly dimensionWeights: Readonly<Record<ScoreDimension, number>>
}

const toHistoryPointDto = (snapshot: AgentScoreSnapshot): AdminAgentScoreHistoryPointDto => ({
  date: snapshot.date,
  score: snapshot.score,
  scoringVersion: snapshot.scoringVersion,
  windowDays: snapshot.windowDays,
  eligibleSessionCount: snapshot.eligibleSessionCount,
})

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

// The seeder reads the project's latest score for the window and session count it should imitate,
// then writes through the org-crossing adapter — see its header for why that is a separate port.
const agentScoreSeedLayers = Layer.mergeAll(
  AdminProjectRepositoryLive,
  AgentScoreSnapshotRepositoryLive,
  AdminAgentScoreHistoryRepositoryLive,
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
        const projectId = ProjectId(project.id)
        const [current, eligibility, history] = yield* Effect.all([
          getLatestAgentScore({ organizationId, projectId }),
          Effect.gen(function* () {
            const featureFlags = yield* AdminFeatureFlagRepository
            return yield* featureFlags.findEligibilityForFlag("agentScore")
          }),
          // Same read the customer trend uses, anchored on today rather than on the snapshot date:
          // staff want the gap where a day failed to publish, not a line that quietly ends early.
          listAgentScoreHistory({ organizationId, projectId }),
        ])
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
          history: history.map(toHistoryPointDto),
          dimensionWeights: LAUNCH_AGENT_SCORE_ARTIFACT.compositeWeights,
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
    const workflowStarter = await getWorkflowStarter()
    await Effect.runPromise(
      Effect.forEach(
        dates,
        (taskDate) =>
          workflowStarter
            .start(
              "agentScoreSnapshotWorkflow",
              {
                organizationId: project.organization.id,
                projectId: project.id,
                date: taskDate,
                force: true,
              },
              {
                workflowId: agentScoreSnapshotWorkflowId({
                  organizationId: project.organization.id,
                  projectId: project.id,
                  date: taskDate,
                  force: true,
                }),
              },
            )
            .pipe(Effect.catchTag("WorkflowAlreadyStartedError", () => Effect.void)),
        { discard: true },
      ).pipe(withTracing),
    )

    return { enqueued: true, date }
  })

/** How many calendar days back the seeder offers, inclusive of today. */
export const AGENT_SCORE_SEED_HISTORY_DAYS = 30

export const SEED_AGENT_SCORE_HISTORY_CONFIRMATION = "seed score history"

/** Exported for input-schema tests. */
export const adminSeedAgentScoreHistoryInputSchema = z.object({
  projectId: z.string().min(1).max(256),
  confirmation: z.literal(SEED_AGENT_SCORE_HISTORY_CONFIRMATION),
  days: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        score: z.number().min(0).max(100),
      }),
    )
    .min(1)
    .max(AGENT_SCORE_SEED_HISTORY_DAYS)
    // A repeated date would be half-written by `onConflictDoNothing` and the reported count would
    // then describe neither what the caller asked for nor what landed.
    .refine((days) => new Set(days.map((day) => day.date)).size === days.length, {
      message: "dates must be unique",
    }),
})

interface AdminSeedAgentScoreHistoryResultDto {
  readonly written: number
  readonly skipped: number
}

/**
 * Fills a project's Agent Score history with scores staff chose, for demos.
 *
 * Nothing is recomputed. A project seeded this morning has the traffic a demo needs and a trend
 * chart with one point in it, because history only accrues a real day at a time; this writes the
 * missing days so the chart has a shape. The scores are fabricated and the stored rows say so only
 * by omission — they carry no explanation, so the page reports no evidence for those dates.
 *
 * Dates that already carry a published score are skipped by the unique index rather than by trust
 * in the caller, so the worst a malformed request can do is write fewer days than it asked for.
 * The organization comes from the project lookup, never from the request, because this is the one
 * writer that files a score under an organization the connection did not scope.
 */
export const adminSeedAgentScoreHistory = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(adminSeedAgentScoreHistoryInputSchema)
  .handler(async ({ data }): Promise<AdminSeedAgentScoreHistoryResultDto> => {
    return await Effect.runPromise(
      Effect.gen(function* () {
        const project = yield* getProjectDetailsUseCase({ projectId: ProjectId(data.projectId) })
        const { written, skipped } = yield* seedAgentScoreHistoryUseCase({
          organizationId: OrganizationId(project.organization.id),
          projectId: ProjectId(project.id),
          days: data.days,
        })
        return { written, skipped }
      }).pipe(withPostgres(agentScoreSeedLayers, getAdminPostgresClient()), withTracing),
    )
  })
