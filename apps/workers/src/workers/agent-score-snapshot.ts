import {
  type AgentScoreArtifact,
  type AgentScoreResult,
  AgentScoreSnapshotRepository,
  type CostMetricCatalog,
  type CostScoringArtifact,
  computeAgentScore,
  type DimensionSnapshot,
  deriveSamplingRates,
  type LatencyReferenceArtifact,
  type ScoringJudge,
} from "@domain/agent-score"
import { FlaggerRepository, SAFETY_SUITE_SLUGS } from "@domain/flaggers"
import type { OrganizationId, ProjectId, ScoreDimension } from "@domain/shared"
import { Effect } from "effect"

const TASK_OUTCOME_SLUG = "task-failure"

interface SnapshotProjectInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** UTC date the sweep resolved, so every project in one run scores the same day. */
  readonly date: string
  readonly artifact: AgentScoreArtifact
  readonly costArtifact: CostScoringArtifact
  readonly catalog: CostMetricCatalog
  readonly latencyArtifact: LatencyReferenceArtifact
  readonly judge: ScoringJudge
}

type SnapshotProjectResult =
  | { readonly status: "published"; readonly score: number }
  | { readonly status: "already-published" }
  | { readonly status: "withheld"; readonly reason: string }

/**
 * Turns the day's cutoff into the instant the window ends.
 *
 * Midnight at the end of the date, so a snapshot dated the 29th covers the 29th. Scoring to the
 * start of the date would publish a number for a day that had not happened.
 */
const DAY_MS = 86_400_000

const startOfUtcDay = (date: string): number => new Date(`${date}T00:00:00.000Z`).getTime()

/**
 * The instant the window ends.
 *
 * The end of the date rather than its start, so a snapshot dated the 29th covers the 29th. Scoring
 * to the start would publish a number for a day that had not happened yet.
 */
const cutoffOf = (date: string): Date => new Date(startOfUtcDay(date) + DAY_MS)

const previousUtcDate = (date: string): string => new Date(startOfUtcDay(date) - DAY_MS).toISOString().slice(0, 10)

const withheldReason = (result: AgentScoreResult): string => {
  if (result.withheldReason === "sessionFloor") return "sessionFloor"
  const unmeasured = result.dimensions
    .filter((dimension) => dimension.coverage !== "measured")
    .map((dimension) => `${dimension.scoreDimension}:${dimension.unmeasuredReason ?? "unmeasured"}`)
  return unmeasured.join(",") || "unmeasured"
}

/**
 * Scores one project for one date and stores the result if there is one to store.
 *
 * Runs under the project's own organisation, so row-level security scopes every read it makes. A
 * withheld calculation writes nothing at all and reports the floor it missed: an unpublished day is
 * a gap in the trend rather than a zero in it, and the reason is what the page needs to explain the
 * gap to somebody looking at it.
 *
 * The derived sampling rates are written even when the score is withheld, and especially then: the
 * usual reason a project cannot publish is that its sampled readers examined too few sessions, and
 * that is the thing the rates exist to fix.
 */
export const snapshotProjectAgentScore = Effect.fn("agentScore.snapshotProject")(function* (
  input: SnapshotProjectInput,
) {
  const to = cutoffOf(input.date)
  const snapshots = yield* AgentScoreSnapshotRepository
  const existing = yield* snapshots.findByDate({
    organizationId: input.organizationId,
    projectId: input.projectId,
    date: input.date,
  })
  if (existing) return { status: "already-published" } satisfies SnapshotProjectResult

  // Yesterday's stored step is what makes today's window choice sticky, and the snapshot is the only
  // durable record of it.
  const previous = yield* snapshots.findByDate({
    organizationId: input.organizationId,
    projectId: input.projectId,
    date: previousUtcDate(input.date),
  })

  const result = yield* computeAgentScore({
    organizationId: input.organizationId,
    projectId: input.projectId,
    to,
    artifact: input.artifact,
    costArtifact: input.costArtifact,
    catalog: input.catalog,
    latencyArtifact: input.latencyArtifact,
    judge: input.judge,
    ...(previous ? { previousStepDays: previous.windowDays } : {}),
  })

  yield* applyDerivedSampling({ projectId: input.projectId, result })

  if (!result.composite || !result.window) {
    return { status: "withheld", reason: withheldReason(result) } satisfies SnapshotProjectResult
  }

  const published = (dimension: ScoreDimension): DimensionSnapshot | null => {
    const entry = result.dimensions.find((candidate) => candidate.scoreDimension === dimension)
    return entry?.score !== undefined && entry.interval ? { score: entry.score, interval: entry.interval } : null
  }
  const dimensions = {
    outcome: published("outcome"),
    reliability: published("reliability"),
    cost: published("cost"),
    speed: published("speed"),
    safety: published("safety"),
  }
  // A composite exists only when all five passed, so this cannot fire; it is here so a future change
  // that publishes a composite without a dimension fails loudly instead of storing a zero.
  if (Object.values(dimensions).some((dimension) => dimension === null)) {
    return { status: "withheld", reason: "missingDimensionScore" } satisfies SnapshotProjectResult
  }

  yield* snapshots.insertIfAbsent({
    organizationId: input.organizationId,
    projectId: input.projectId,
    date: input.date,
    scoringVersion: result.scoringVersion,
    windowDays: result.window.stepDays,
    eligibleSessionCount: result.window.eligibleSessionCount,
    score: result.composite.score,
    interval: result.composite.interval,
    dimensions: dimensions as Record<ScoreDimension, DimensionSnapshot>,
    ...(result.composite.policyCap?.applied ? { policyCap: result.composite.policyCap.cap } : {}),
    createdAt: new Date(),
  })

  return { status: "published", score: result.composite.score } satisfies SnapshotProjectResult
})

const applyDerivedSampling = ({
  projectId,
  result,
}: {
  readonly projectId: ProjectId
  readonly result: AgentScoreResult
}) =>
  Effect.gen(function* () {
    const eligibleSessions = result.window?.eligibleSessionCount ?? result.coverage?.eligibleSessionCount ?? 0
    if (eligibleSessions <= 0) return 0
    const rates = deriveSamplingRates({ eligibleSessions })
    const flaggers = yield* FlaggerRepository
    return yield* flaggers.applyDerivedSampling({
      projectId,
      rates: [
        { slug: TASK_OUTCOME_SLUG, sampling: rates.taskOutcomePercent },
        ...SAFETY_SUITE_SLUGS.map((slug) => ({ slug, sampling: rates.safetySuitePercent })),
      ],
    })
  })
