import { type OrganizationId, type ProjectId, SCORE_DIMENSIONS, type ScoreDimension } from "@domain/shared"
import { Effect } from "effect"
import type { AgentScoreSnapshot, ScoreInterval } from "../entities/agent-score-snapshot.ts"
import { utcDateOf } from "../entities/agent-score-snapshot.ts"
import { AgentScoreSnapshotRepository } from "../ports/agent-score-snapshot-repository.ts"

/** Days the weekly digest reaches back over, inclusive of the day it runs. */
export const AGENT_SCORE_DIGEST_WINDOW_DAYS = 7

const DAY_MS = 86_400_000

/**
 * How the week's newest score compares to the oldest one published in the same window.
 *
 * `incomparable` exists because two snapshots can disagree about what they measured. A scoring
 * version bump changes the scale, and a window step change (7/14/21/28 days, chosen with
 * hysteresis) changes how much evidence each number covers. Subtracting across either produces a
 * difference that is an artifact of the change rather than movement in the agent.
 */
export type AgentScoreDigestComparison =
  | { readonly status: "none" }
  | {
      readonly status: "incomparable"
      readonly reason: "scoringVersion" | "windowDays"
      readonly baselineDate: string
      readonly baselineScore: number
    }
  | {
      readonly status: "comparable"
      readonly baselineDate: string
      readonly baselineScore: number
      readonly delta: number
      /** False when the two intervals overlap, which makes the delta noise rather than movement. */
      readonly significant: boolean
    }

export interface WeeklyAgentScoreDigest {
  /** The newest published date in the window, which is the number the digest leads with. */
  readonly date: string
  readonly windowStart: string
  readonly windowEnd: string
  readonly score: number
  readonly interval: ScoreInterval
  readonly scoringVersion: string
  readonly windowDays: number
  readonly eligibleSessionCount: number
  /** Days in the window that published a score; the rest are gaps rather than zeros. */
  readonly publishedDayCount: number
  /** Every published day in the window, oldest first, for the trend the digest draws. */
  readonly series: readonly { readonly date: string; readonly score: number }[]
  readonly dimensions: Record<ScoreDimension, { readonly score: number; readonly delta: number | null }>
  readonly comparison: AgentScoreDigestComparison
}

export type BuildWeeklyAgentScoreDigestResult =
  | { readonly status: "ok"; readonly digest: WeeklyAgentScoreDigest }
  | { readonly status: "skipped"; readonly reason: "no-score" }

/** The inclusive UTC date bounds of the digest that runs at `now`. */
export const agentScoreDigestWindow = (now: Date): { readonly from: string; readonly to: string } => {
  const to = utcDateOf(now)
  const from = utcDateOf(
    new Date(new Date(`${to}T00:00:00.000Z`).getTime() - (AGENT_SCORE_DIGEST_WINDOW_DAYS - 1) * DAY_MS),
  )
  return { from, to }
}

const overlaps = (a: ScoreInterval, b: ScoreInterval): boolean => a.lower <= b.upper && b.lower <= a.upper

const compare = (current: AgentScoreSnapshot, baseline: AgentScoreSnapshot | undefined): AgentScoreDigestComparison => {
  if (!baseline) return { status: "none" }
  const anchor = { baselineDate: baseline.date, baselineScore: baseline.score }
  if (baseline.scoringVersion !== current.scoringVersion) {
    return { status: "incomparable", reason: "scoringVersion", ...anchor }
  }
  if (baseline.windowDays !== current.windowDays) {
    return { status: "incomparable", reason: "windowDays", ...anchor }
  }
  return {
    status: "comparable",
    ...anchor,
    delta: current.score - baseline.score,
    significant: !overlaps(current.interval, baseline.interval),
  }
}

/**
 * Folds a window of published snapshots into the week's digest.
 *
 * The baseline is the oldest snapshot still inside the window rather than the one seven days back:
 * a withheld day writes no row at all, so most projects have gaps and a fixed offset would usually
 * find nothing to compare against. Per-dimension deltas are computed only when the composite
 * comparison holds, because the reasons a composite cannot be compared apply to every dimension
 * under it.
 */
export const buildWeeklyAgentScoreDigest = (input: {
  readonly snapshots: readonly AgentScoreSnapshot[]
  readonly windowStart: string
  readonly windowEnd: string
}): BuildWeeklyAgentScoreDigestResult => {
  const ordered = [...input.snapshots]
    .filter((snapshot) => snapshot.date >= input.windowStart && snapshot.date <= input.windowEnd)
    .sort((a, b) => a.date.localeCompare(b.date))

  const current = ordered.at(-1)
  if (!current) return { status: "skipped", reason: "no-score" }

  const baseline = ordered.length > 1 ? ordered[0] : undefined
  const comparison = compare(current, baseline)
  const against = comparison.status === "comparable" ? baseline : undefined

  const dimensions = Object.fromEntries(
    SCORE_DIMENSIONS.map((dimension) => [
      dimension,
      {
        score: current.dimensions[dimension].score,
        delta: against ? current.dimensions[dimension].score - against.dimensions[dimension].score : null,
      },
    ]),
  ) as WeeklyAgentScoreDigest["dimensions"]

  return {
    status: "ok",
    digest: {
      date: current.date,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      score: current.score,
      interval: current.interval,
      scoringVersion: current.scoringVersion,
      windowDays: current.windowDays,
      eligibleSessionCount: current.eligibleSessionCount,
      publishedDayCount: ordered.length,
      series: ordered.map((snapshot) => ({ date: snapshot.date, score: snapshot.score })),
      dimensions,
      comparison,
    },
  }
}

/**
 * The window's digest for one project, read under that project's own organisation.
 *
 * Never falls back to a snapshot older than the window: a project whose newest score predates it
 * has nothing to report this week, and a stale number presented as the week's is wrong in the one
 * way a reader cannot detect.
 */
export const runWeeklyAgentScoreDigest = Effect.fn("agentScore.runWeeklyDigest")(function* (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly windowStart: string
  readonly windowEnd: string
}) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)

  const repository = yield* AgentScoreSnapshotRepository
  const snapshots = yield* repository.listHistory({
    organizationId: input.organizationId,
    projectId: input.projectId,
    from: input.windowStart,
    to: input.windowEnd,
  })

  return buildWeeklyAgentScoreDigest({
    snapshots,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  })
})
