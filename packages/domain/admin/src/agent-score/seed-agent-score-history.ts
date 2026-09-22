import {
  getLatestAgentScore,
  LAUNCH_AGENT_SCORE_ARTIFACT,
  LAUNCH_SCORING_VERSION,
  syntheticAgentScoreSnapshot,
} from "@domain/agent-score"
import { type OrganizationId, type ProjectId, ValidationError } from "@domain/shared"
import { Effect } from "effect"
import { AdminAgentScoreHistoryRepository } from "./agent-score-history-repository.ts"

// Shortest step on purpose: tomorrow's run reads this as its hysteresis anchor, and a short anchor
// that misses the session floor is the one hysteresis ignores instead of pinning the real window.
const FALLBACK_WINDOW_DAYS = Math.min(...LAUNCH_AGENT_SCORE_ARTIFACT.window.stepDays)

const FALLBACK_ELIGIBLE_SESSIONS = LAUNCH_AGENT_SCORE_ARTIFACT.window.sessionTarget

/** How far back a seeded range may reach, inclusive of today. */
export const SEED_AGENT_SCORE_HISTORY_DAYS = 30

const DAY_MS = 86_400_000

const utcDate = (at: Date): string => at.toISOString().slice(0, 10)

const isCalendarDate = (date: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) && utcDate(new Date(`${date}T00:00:00.000Z`)) === date

// The forward bound is load-bearing: seeding and the daily job share insert-if-absent on
// (organization, project, date), so a future row makes the real run no-op when that date arrives.
export const seedableDateRange = (now: Date): { readonly from: string; readonly to: string } => {
  const to = utcDate(now)
  return { from: utcDate(new Date(new Date(`${to}T00:00:00.000Z`).getTime() - (SEED_AGENT_SCORE_HISTORY_DAYS - 1) * DAY_MS)), to }
}

export interface SeedAgentScoreHistoryDay {
  /** UTC date, `YYYY-MM-DD`. */
  readonly date: string
  /** The composite to publish for that date, 0–100. */
  readonly score: number
}

export interface SeedAgentScoreHistoryResult {
  readonly requested: number
  readonly written: number
  /** Dates that already carried a published score and were left exactly as they were. */
  readonly skipped: number
}

/** Publishes under the live scoring version; the page rejects explanations whose version differs. */
export const seedAgentScoreHistoryUseCase = Effect.fn("admin.seedAgentScoreHistory")(function* (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly days: readonly SeedAgentScoreHistoryDay[]
  readonly now?: Date
}) {
  const history = yield* AdminAgentScoreHistoryRepository
  if (input.days.length === 0) {
    return { requested: 0, written: 0, skipped: 0 } satisfies SeedAgentScoreHistoryResult
  }

  const { from, to } = seedableDateRange(input.now ?? new Date())
  const outOfRange = input.days.filter((day) => !isCalendarDate(day.date) || day.date < from || day.date > to)
  if (outOfRange.length > 0) {
    return yield* Effect.fail(
      new ValidationError({
        field: "days",
        message: `Seeded dates must be real calendar days between ${from} and ${to}: ${outOfRange
          .map((day) => day.date)
          .join(", ")}`,
      }),
    )
  }

  const latest = yield* getLatestAgentScore({
    organizationId: input.organizationId,
    projectId: input.projectId,
    ...(input.now ? { now: input.now } : {}),
  })
  const windowDays = latest.available ? latest.snapshot.windowDays : FALLBACK_WINDOW_DAYS
  const eligibleSessionCount = latest.available ? latest.snapshot.eligibleSessionCount : FALLBACK_ELIGIBLE_SESSIONS
  const createdAt = input.now ?? new Date()

  const written = yield* history.insertSnapshotsIfAbsent(
    input.days.map((day) =>
      syntheticAgentScoreSnapshot({
        organizationId: input.organizationId,
        projectId: input.projectId,
        date: day.date,
        score: day.score,
        scoringVersion: LAUNCH_SCORING_VERSION,
        windowDays,
        eligibleSessionCount,
        weights: LAUNCH_AGENT_SCORE_ARTIFACT.compositeWeights,
        createdAt,
      }),
    ),
  )

  return {
    requested: input.days.length,
    written,
    skipped: input.days.length - written,
  } satisfies SeedAgentScoreHistoryResult
})
