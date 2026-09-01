import { ScoreId, SignalId } from "@domain/shared"
import { buildSeedAnchoredAnnotations } from "@domain/shared/seed-content/anchored-annotations"
import {
  TAU2_SEED_SIGNAL_FAMILIES,
  TAU2_SEED_TRAJECTORIES,
  type Tau2SeedTrajectory,
  tau2TrajectoryIndexForSignalOccurrence,
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

function buildTau2Feedback(signalName: string, trajectory: Tau2SeedTrajectory): string {
  return (
    `${signalName}: tau2 ${trajectory.domain} task ${trajectory.taskId} failed benchmark reward ${trajectory.reward}. ` +
    `Customer goal: ${trajectory.reasonForCall.slice(0, 360)}`
  )
}

function buildTau2SignalScoreRows(scope: SeedScope, maxTrajectories = TAU2_SEED_TRAJECTORIES.length) {
  const orgId = scope.organizationId
  const projectId = scope.projectId

  return SEED_SIGNAL_FIXTURES.flatMap((issue, signalIndex) => {
    const family = TAU2_SEED_SIGNAL_FAMILIES[signalIndex % TAU2_SEED_SIGNAL_FAMILIES.length]!
    const occurrenceCount = signalIndex < 8 ? 12 : 3

    return Array.from({ length: occurrenceCount }, (_, occurrenceIndex) => {
      const trajectoryIndex = tau2TrajectoryIndexForSignalOccurrence({ signalIndex, occurrenceIndex, maxTrajectories })
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
          signalFamily: family.key,
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

function buildTau2ControlScoreRows(scope: SeedScope, maxTrajectories = TAU2_SEED_TRAJECTORIES.length) {
  const orgId = scope.organizationId
  const projectId = scope.projectId
  const successIndexes = TAU2_SEED_TRAJECTORIES.slice(0, maxTrajectories)
    .flatMap((trajectory, index) => (trajectory.outcome === "success" && trajectory.reward >= 1 ? [index] : []))
    .slice(0, 6)

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

/**
 * Published flagger annotations for the named signals. The anchored ones carry a
 * `messageIndex` (and sometimes a substring range), which is what lets the
 * Conversation tab scroll to the flagged turn.
 */
export function buildAnchoredAnnotationScoreRows(scope: SeedScope, maxTrajectories?: number) {
  const orgId = scope.organizationId
  const projectId = scope.projectId

  return buildSeedAnchoredAnnotations(maxTrajectories).map((annotation) => {
    const createdAt = scope.dateDaysAgo(annotation.daysAgo, annotation.hour, annotation.minute)

    return {
      id: ScoreId(scope.cuid(`score:tau2-annotation:${annotation.key}`)),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: scope.traceHex("tau2-trajectory", annotation.trajectoryIndex),
      spanId: null,
      sourceType: "annotation" as const,
      sourceId: "SYSTEM",
      simulationId: null,
      signalId: scopedSignalIdByFixtureIndex(scope, annotation.signalIndex),
      value: 0,
      passed: false,
      feedback: annotation.feedback,
      metadata: {
        rawFeedback: annotation.rawFeedback,
        flaggerSlug: annotation.flaggerSlug,
        ...(annotation.anchor ?? {}),
      },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: null,
      annotatorId: null,
      createdAt,
      updatedAt: createdAt,
    }
  })
}

function buildAllScoreRows(scope: SeedScope, maxTau2Trajectories?: number) {
  const tau2ControlScoreRows = buildTau2ControlScoreRows(scope, maxTau2Trajectories)
  const tau2SignalScoreRows = buildTau2SignalScoreRows(scope, maxTau2Trajectories)
  const anchoredAnnotationScoreRows = buildAnchoredAnnotationScoreRows(scope, maxTau2Trajectories)

  return {
    tau2ControlScoreRows,
    tau2SignalScoreRows,
    anchoredAnnotationScoreRows,
    all: [...tau2ControlScoreRows, ...tau2SignalScoreRows, ...anchoredAnnotationScoreRows],
  }
}

/**
 * The subset of seeded score rows that are linked to an issue and not in
 * draft state — consumed by the signals seeder to derive issue centroids
 * from feedback embeddings.
 */
export const buildSignalLinkedScoreSeedRows = (scope: SeedScope) => {
  const built = buildAllScoreRows(scope)
  return [...built.tau2SignalScoreRows, ...built.anchoredAnnotationScoreRows].filter(
    (row): row is typeof row & { signalId: string } => row.signalId !== null && row.draftedAt === null,
  )
}

const seedScores: Seeder = {
  name: "scores/tau2-support-score-graph",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        const built = buildAllScoreRows(ctx.scope, ctx.maxTau2Trajectories)
        const allScoreRows = built.all
        for (const row of allScoreRows) {
          const { id, ...set } = row
          await ctx.db.insert(scores).values(row).onConflictDoUpdate({
            target: scores.id,
            set,
          })
        }

        console.log(
          `  -> scores: ${allScoreRows.length} total (${built.tau2SignalScoreRows.length} tau2 issue-linked, ${built.tau2ControlScoreRows.length} tau2 controls, ${built.anchoredAnnotationScoreRows.length} flagger annotations)`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed scores", cause: error }),
    }).pipe(Effect.asVoid),
}

export const scoreSeeders: readonly Seeder[] = [seedScores]
