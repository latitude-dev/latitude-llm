import {
  getLatestAgentScore,
  LAUNCH_AGENT_SCORE_ARTIFACT,
  LAUNCH_SCORING_VERSION,
  syntheticAgentScoreSnapshot,
} from "@domain/agent-score"
import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { AdminAgentScoreHistoryRepository } from "./agent-score-history-repository.ts"

/**
 * The window a seeded day claims when the project has never published a score.
 *
 * The shortest step on purpose. Tomorrow's real run reads the previous day's window as its
 * hysteresis anchor, and a short anchor is the one that gets ignored: hysteresis only holds a
 * previous window that still clears the session floor, which a 7-day window on a quiet project
 * will not. Seeding the longest step instead would let a fabricated row pin the real scoring
 * window for as long as the project keeps publishing.
 */
const FALLBACK_WINDOW_DAYS = Math.min(...LAUNCH_AGENT_SCORE_ARTIFACT.window.stepDays)

/** The session count a seeded day claims when there is no real snapshot to copy one from. */
const FALLBACK_ELIGIBLE_SESSIONS = LAUNCH_AGENT_SCORE_ARTIFACT.window.sessionTarget

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

/**
 * Gives a project a score history it never earned.
 *
 * Demo projects are seeded with traces, sessions and signals, and can even be scored for today, but
 * history accrues one real day at a time — so a project built this morning has a trend chart with
 * nothing in it and no way to fill it except waiting a month. This writes the missing days
 * directly from scores staff choose, rather than recomputing anything: there is no evidence behind
 * these dates to recompute from, and pretending otherwise would take minutes per day and still
 * produce nothing.
 *
 * Days that already have a score are skipped rather than overwritten, by the same insert-if-absent
 * contract the daily job uses. Real history always wins, and re-running with the same range is
 * therefore free.
 *
 * The scoring version and dimension weights are the live ones. A seeded range that claimed a
 * different version would read as a broken measurement on the chart, which is the opposite of what
 * a demo wants, and would make the page reject any real explanation that landed on those dates.
 */
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

  // Copied from the project's own latest score when it has one, so a seeded day is indistinguishable
  // from its neighbours in window and session count rather than announcing itself with odd numbers.
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
