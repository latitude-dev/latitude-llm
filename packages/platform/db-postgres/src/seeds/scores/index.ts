import { IssueId, ScoreId } from "@domain/shared"
import {
  classifyTau2SeedTrajectory,
  TAU2_SEED_ISSUE_FAMILIES,
  TAU2_SEED_TRAJECTORIES,
  type Tau2SeedTrajectory,
} from "@domain/shared/seed-content/tau2-trajectories"
import { SEED_ISSUE_FIXTURES, type SeedScope } from "@domain/shared/seeding"
import { Effect } from "effect"
import { scores } from "../../schema/scores.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const NAMED_ISSUE_KEYS = [
  "warranty-fab",
  "combination",
  "logistics",
  "returns",
  "billing",
  "access",
  "installation",
  "flagger",
] as const

function scopedIssueIdByFixtureIndex(scope: SeedScope, index: number): string {
  const key = NAMED_ISSUE_KEYS[index]
  return key === undefined
    ? IssueId(scope.cuid(`issue:extra:${index - NAMED_ISSUE_KEYS.length}`))
    : IssueId(scope.cuid(`issue:${key}`))
}

function createdAtForTau2Issue(scope: SeedScope, issueIndex: number, occurrenceIndex: number): Date {
  return scope.dateDaysAgo(
    (issueIndex * 3 + occurrenceIndex * 5) % 14,
    (issueIndex * 7 + occurrenceIndex * 11) % 24,
    (issueIndex * 13 + occurrenceIndex * 17) % 60,
  )
}

function buildFailedTrajectoryIndexesByFamily() {
  const byFamily = new Map<(typeof TAU2_SEED_ISSUE_FAMILIES)[number]["key"], number[]>()

  TAU2_SEED_TRAJECTORIES.forEach((trajectory, trajectoryIndex) => {
    const family = classifyTau2SeedTrajectory(trajectory)
    if (family === null) return

    const indexes = byFamily.get(family) ?? []
    indexes.push(trajectoryIndex)
    byFamily.set(family, indexes)
  })

  return byFamily
}

function buildTau2Feedback(issueName: string, trajectory: Tau2SeedTrajectory): string {
  return (
    `${issueName}: tau2 ${trajectory.domain} task ${trajectory.taskId} failed benchmark reward ${trajectory.reward}. ` +
    `Customer goal: ${trajectory.reasonForCall.slice(0, 360)}`
  )
}

function buildTau2IssueScoreRows(scope: SeedScope) {
  const orgId = scope.organizationId
  const projectId = scope.projectId
  const familyKeys = TAU2_SEED_ISSUE_FAMILIES.map((family) => family.key)
  const failedByFamily = buildFailedTrajectoryIndexesByFamily()
  const allFailedTrajectoryIndexes = TAU2_SEED_TRAJECTORIES.flatMap((trajectory, index) =>
    trajectory.outcome === "failure" || trajectory.reward < 1 ? [index] : [],
  )

  return SEED_ISSUE_FIXTURES.flatMap((issue, issueIndex) => {
    const family = familyKeys[issueIndex % familyKeys.length]!
    const candidateIndexes = failedByFamily.get(family) ?? allFailedTrajectoryIndexes
    const occurrenceCount = issueIndex < 8 ? 12 : 3

    return Array.from({ length: occurrenceCount }, (_, occurrenceIndex) => {
      const trajectoryIndex = candidateIndexes[(issueIndex + occurrenceIndex) % candidateIndexes.length] ?? 0
      const trajectory = TAU2_SEED_TRAJECTORIES[trajectoryIndex]!
      const createdAt = createdAtForTau2Issue(scope, issueIndex, occurrenceIndex)

      return {
        id: ScoreId(scope.cuid(`score:tau2-issue:${issueIndex}:${occurrenceIndex}`)),
        organizationId: orgId,
        projectId,
        sessionId: null,
        traceId: scope.traceHex("tau2-trajectory", trajectoryIndex),
        spanId: scope.spanHex("tau2-trajectory-root", trajectoryIndex),
        source: "custom" as const,
        sourceId: "tau2-seed-classifier",
        simulationId: null,
        issueId: scopedIssueIdByFixtureIndex(scope, issueIndex),
        value: 0.05 + (occurrenceIndex % 4) * 0.03,
        passed: false,
        feedback: buildTau2Feedback(issue.name, trajectory),
        metadata: {
          dataset: "tau2-bench",
          sourceFile: trajectory.sourceFile,
          domain: trajectory.domain,
          taskId: trajectory.taskId,
          outcome: trajectory.outcome,
          reward: String(trajectory.reward),
          issueFamily: family,
          trajectoryIndex: String(trajectoryIndex),
        },
        error: null,
        errored: false,
        duration: 0,
        tokens: 0,
        cost: 0,
        draftedAt: null,
        createdAt,
        updatedAt: createdAt,
      }
    })
  })
}

function buildTau2ControlScoreRows(scope: SeedScope) {
  const orgId = scope.organizationId
  const projectId = scope.projectId
  const successIndexes = TAU2_SEED_TRAJECTORIES.flatMap((trajectory, index) =>
    trajectory.outcome === "success" && trajectory.reward >= 1 ? [index] : [],
  ).slice(0, 6)

  return successIndexes.map((trajectoryIndex, index) => {
    const trajectory = TAU2_SEED_TRAJECTORIES[trajectoryIndex]!
    const createdAt = scope.dateDaysAgo(index % 7, 9 + index, 15)

    return {
      id: ScoreId(scope.cuid(`score:tau2-control:${index}`)),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: scope.traceHex("tau2-trajectory", trajectoryIndex),
      spanId: scope.spanHex("tau2-trajectory-root", trajectoryIndex),
      source: "custom" as const,
      sourceId: "tau2-seed-classifier",
      simulationId: null,
      issueId: null,
      value: 0.97,
      passed: true,
      feedback: `Tau2 ${trajectory.domain} task ${trajectory.taskId} completed successfully with benchmark reward ${trajectory.reward}.`,
      metadata: {
        dataset: "tau2-bench",
        sourceFile: trajectory.sourceFile,
        domain: trajectory.domain,
        taskId: trajectory.taskId,
        outcome: trajectory.outcome,
        reward: String(trajectory.reward),
        trajectoryIndex: String(trajectoryIndex),
      },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: null,
      createdAt,
      updatedAt: createdAt,
    }
  })
}

function buildAllScoreRows(scope: SeedScope) {
  const tau2ControlScoreRows = buildTau2ControlScoreRows(scope)
  const tau2IssueScoreRows = buildTau2IssueScoreRows(scope)

  return {
    tau2ControlScoreRows,
    tau2IssueScoreRows,
    all: [...tau2ControlScoreRows, ...tau2IssueScoreRows],
  }
}

/**
 * The subset of seeded score rows that are linked to an issue and not in
 * draft state — consumed by the issues seeder to derive issue centroids
 * from feedback embeddings.
 */
export const buildIssueLinkedScoreSeedRows = (scope: SeedScope) =>
  buildAllScoreRows(scope).tau2IssueScoreRows.filter(
    (row): row is typeof row & { issueId: string } => row.issueId !== null && row.draftedAt === null,
  )

const seedScores: Seeder = {
  name: "scores/tau2-support-score-graph",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const built = buildAllScoreRows(ctx.scope)
        const allScoreRows = built.all
        for (const row of allScoreRows) {
          const { id, ...set } = row
          await ctx.db.insert(scores).values(row).onConflictDoUpdate({
            target: scores.id,
            set,
          })
        }

        console.log(
          `  -> scores: ${allScoreRows.length} total (${built.tau2IssueScoreRows.length} tau2 issue-linked, ${built.tau2ControlScoreRows.length} tau2 controls)`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed scores", cause: error }),
    }).pipe(Effect.asVoid),
}

export const scoreSeeders: readonly Seeder[] = [seedScores]
