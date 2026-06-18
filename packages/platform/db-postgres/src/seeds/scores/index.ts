import { ScoreId, SignalId } from "@domain/shared"
import {
  classifyTau2SeedTrajectory,
  TAU2_SEED_SIGNAL_FAMILIES,
  TAU2_SEED_TRAJECTORIES,
  type Tau2SeedTrajectory,
} from "@domain/shared/seed-content/tau2-trajectories"
import { SEED_SIGNAL_FIXTURES, type SeedScope } from "@domain/shared/seeding"
import { Effect } from "effect"
import { scores } from "../../schema/scores.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

const NAMED_SIGNAL_KEYS = [
  "warranty-fab",
  "combination",
  "logistics",
  "returns",
  "billing",
  "access",
  "installation",
  "flagger",
] as const

function scopedSignalIdByFixtureIndex(scope: SeedScope, index: number): string {
  const key = NAMED_SIGNAL_KEYS[index]
  return key === undefined
    ? SignalId(scope.cuid(`issue:extra:${index - NAMED_SIGNAL_KEYS.length}`))
    : SignalId(scope.cuid(`issue:${key}`))
}

function createdAtForTau2Signal(scope: SeedScope, signalIndex: number, occurrenceIndex: number): Date {
  return scope.dateDaysAgo(
    (signalIndex * 3 + occurrenceIndex * 5) % 14,
    (signalIndex * 7 + occurrenceIndex * 11) % 24,
    (signalIndex * 13 + occurrenceIndex * 17) % 60,
  )
}

function buildFailedTrajectoryIndexesByFamily() {
  const byFamily = new Map<(typeof TAU2_SEED_SIGNAL_FAMILIES)[number]["key"], number[]>()

  TAU2_SEED_TRAJECTORIES.forEach((trajectory, trajectoryIndex) => {
    const family = classifyTau2SeedTrajectory(trajectory)
    if (family === null) return

    const indexes = byFamily.get(family) ?? []
    indexes.push(trajectoryIndex)
    byFamily.set(family, indexes)
  })

  return byFamily
}

function buildTau2Feedback(signalName: string, trajectory: Tau2SeedTrajectory): string {
  return (
    `${signalName}: tau2 ${trajectory.domain} task ${trajectory.taskId} failed benchmark reward ${trajectory.reward}. ` +
    `Customer goal: ${trajectory.reasonForCall.slice(0, 360)}`
  )
}

function buildTau2SignalScoreRows(scope: SeedScope) {
  const orgId = scope.organizationId
  const projectId = scope.projectId
  const familyKeys = TAU2_SEED_SIGNAL_FAMILIES.map((family) => family.key)
  const failedByFamily = buildFailedTrajectoryIndexesByFamily()
  const allFailedTrajectoryIndexes = TAU2_SEED_TRAJECTORIES.flatMap((trajectory, index) =>
    trajectory.outcome === "failure" || trajectory.reward < 1 ? [index] : [],
  )

  return SEED_SIGNAL_FIXTURES.flatMap((issue, signalIndex) => {
    const family = familyKeys[signalIndex % familyKeys.length]!
    const candidateIndexes = failedByFamily.get(family) ?? allFailedTrajectoryIndexes
    const occurrenceCount = signalIndex < 8 ? 12 : 3

    return Array.from({ length: occurrenceCount }, (_, occurrenceIndex) => {
      const trajectoryIndex = candidateIndexes[(signalIndex + occurrenceIndex) % candidateIndexes.length] ?? 0
      const trajectory = TAU2_SEED_TRAJECTORIES[trajectoryIndex]!
      const createdAt = createdAtForTau2Signal(scope, signalIndex, occurrenceIndex)

      return {
        id: ScoreId(scope.cuid(`score:tau2-issue:${signalIndex}:${occurrenceIndex}`)),
        organizationId: orgId,
        projectId,
        sessionId: null,
        traceId: scope.traceHex("tau2-trajectory", trajectoryIndex),
        spanId: scope.spanHex("tau2-trajectory-root", trajectoryIndex),
        sourceType: "custom" as const,
        sourceId: "tau2-seed-classifier",
        simulationId: null,
        signalId: scopedSignalIdByFixtureIndex(scope, signalIndex),
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
          signalFamily: family,
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
      sourceType: "custom" as const,
      sourceId: "tau2-seed-classifier",
      simulationId: null,
      signalId: null,
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
  const tau2SignalScoreRows = buildTau2SignalScoreRows(scope)

  return {
    tau2ControlScoreRows,
    tau2SignalScoreRows,
    all: [...tau2ControlScoreRows, ...tau2SignalScoreRows],
  }
}

/**
 * The subset of seeded score rows that are linked to an issue and not in
 * draft state — consumed by the signals seeder to derive issue centroids
 * from feedback embeddings.
 */
export const buildSignalLinkedScoreSeedRows = (scope: SeedScope) =>
  buildAllScoreRows(scope).tau2SignalScoreRows.filter(
    (row): row is typeof row & { signalId: string } => row.signalId !== null && row.draftedAt === null,
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
          `  -> scores: ${allScoreRows.length} total (${built.tau2SignalScoreRows.length} tau2 issue-linked, ${built.tau2ControlScoreRows.length} tau2 controls)`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed scores", cause: error }),
    }).pipe(Effect.asVoid),
}

export const scoreSeeders: readonly Seeder[] = [seedScores]
