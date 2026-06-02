import { EvaluationId, IssueId, ScoreId } from "@domain/shared"
import {
  classifyTau2SeedTrajectory,
  TAU2_SEED_ISSUE_FAMILIES,
  TAU2_SEED_TRAJECTORIES,
} from "@domain/shared/seed-content/tau2-trajectories"
import { SEED_ISSUE_FIXTURES, type SeedScope } from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import { isSentinelPresent } from "../idempotency.ts"
import type { Seeder } from "../types.ts"

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

async function scopedIssueIdByFixtureIndex(scope: SeedScope, index: number): Promise<string> {
  const key = NAMED_ISSUE_KEYS[index]
  return key === undefined
    ? IssueId(await scope.cuid(`issue:extra:${index - NAMED_ISSUE_KEYS.length}`))
    : IssueId(await scope.cuid(`issue:${key}`))
}

function createdAtForTau2Issue(scope: SeedScope, issueIndex: number, occurrenceIndex: number): string {
  return scope.timestampDaysAgo(
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

async function buildTau2IssueAnalyticsRows(scope: SeedScope) {
  const orgId = scope.organizationId
  const projectId = scope.projectId
  const familyKeys = TAU2_SEED_ISSUE_FAMILIES.map((family) => family.key)
  const failedByFamily = buildFailedTrajectoryIndexesByFamily()
  const allFailedTrajectoryIndexes = TAU2_SEED_TRAJECTORIES.flatMap((trajectory, index) =>
    trajectory.outcome === "failure" || trajectory.reward < 1 ? [index] : [],
  )

  const rows = await Promise.all(
    SEED_ISSUE_FIXTURES.map(async (_, issueIndex) => {
      const family = familyKeys[issueIndex % familyKeys.length]!
      const candidateIndexes = failedByFamily.get(family) ?? allFailedTrajectoryIndexes
      const occurrenceCount = issueIndex < 8 ? 12 : 3

      return Promise.all(
        Array.from({ length: occurrenceCount }, async (_, occurrenceIndex) => {
          const trajectoryIndex = candidateIndexes[(issueIndex + occurrenceIndex) % candidateIndexes.length] ?? 0
          return {
            id: ScoreId(await scope.cuid(`score:tau2-issue:${issueIndex}:${occurrenceIndex}`)),
            organization_id: orgId,
            project_id: projectId,
            session_id: "",
            trace_id: await scope.traceHex("tau2-trajectory", trajectoryIndex),
            span_id: await scope.spanHex("tau2-trajectory-root", trajectoryIndex),
            source: "custom",
            source_id: "tau2-seed-classifier",
            simulation_id: "",
            issue_id: await scopedIssueIdByFixtureIndex(scope, issueIndex),
            value: 0.05 + (occurrenceIndex % 4) * 0.03,
            passed: false,
            errored: false,
            duration: 0,
            tokens: 0,
            cost: 0,
            created_at: createdAtForTau2Issue(scope, issueIndex, occurrenceIndex),
          }
        }),
      )
    }),
  )
  return rows.flat()
}

/** Compatibility lifecycle scores on fixed trace ids (used by trace filter tests and demos). */
export async function buildLifecycleAnalyticsRows(scope: SeedScope) {
  const orgId = scope.organizationId
  const projectId = scope.projectId
  const evaluationWarrantyActiveId = EvaluationId(await scope.cuid("evaluation:warranty-active"))
  const evaluationCombinationId = EvaluationId(await scope.cuid("evaluation:combination"))

  return [
    {
      id: ScoreId(await scope.cuid("score:passed")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: await scope.traceHex("lifecycle", 2),
      span_id: await scope.spanHex("lifecycle", 2),
      source: "evaluation",
      source_id: evaluationWarrantyActiveId,
      simulation_id: "",
      issue_id: "",
      value: 0.98,
      passed: true,
      errored: false,
      duration: 850_000_000,
      tokens: 1_820,
      cost: 245_000,
      created_at: scope.timestampDaysAgo(10, 10),
    },
    {
      id: ScoreId(await scope.cuid("score:errored")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: await scope.traceHex("lifecycle", 3),
      span_id: await scope.spanHex("lifecycle", 3),
      source: "evaluation",
      source_id: evaluationCombinationId,
      simulation_id: "",
      issue_id: "",
      value: 0,
      passed: false,
      errored: true,
      duration: 120_000_000,
      tokens: 0,
      cost: 0,
      created_at: scope.timestampDaysAgo(9, 11),
    },
    {
      id: ScoreId(await scope.cuid("score:api-reviewed")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: await scope.traceHex("lifecycle", 3),
      span_id: "",
      source: "annotation",
      source_id: "API",
      simulation_id: "",
      issue_id: "",
      value: 0.91,
      passed: true,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: scope.timestampDaysAgo(2, 12, 45),
    },
    {
      id: ScoreId(await scope.cuid("score:pending")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: await scope.traceHex("lifecycle", 4),
      span_id: "",
      source: "custom",
      source_id: "seed-import",
      simulation_id: "",
      issue_id: "",
      value: 0.88,
      passed: true,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: scope.timestampDaysAgo(1, 8, 30),
    },
  ]
}

async function buildAllAnalyticsRows(scope: SeedScope) {
  const lifecycleAnalyticsRows = await buildLifecycleAnalyticsRows(scope)
  const tau2IssueAnalyticsRows = await buildTau2IssueAnalyticsRows(scope)

  return {
    lifecycleAnalyticsRows,
    tau2IssueAnalyticsRows,
    all: [...lifecycleAnalyticsRows, ...tau2IssueAnalyticsRows],
  }
}

const seedScores: Seeder = {
  name: "scores/tau2-support-analytics",
  run: (ctx) =>
    Effect.gen(function* () {
      // Sentinel: the first deterministic score id this seeder inserts.
      const sentinel = ScoreId(yield* Effect.promise(() => ctx.scope.cuid("score:tau2-issue:0:0")))
      const present = yield* isSentinelPresent(ctx.client, "scores", "id = {sentinel:String}", { sentinel })
      if (present) {
        if (!ctx.quiet) console.log("  -> scores/tau2-support-analytics: already seeded, skipping")
        return
      }
      const built = yield* Effect.promise(() => buildAllAnalyticsRows(ctx.scope))
      yield* insertJsonEachRow(ctx.client, "scores", built.all)
      if (!ctx.quiet) {
        console.log(
          `  -> scores: ${built.all.length} analytics rows (${built.lifecycleAnalyticsRows.length} lifecycle; ${built.tau2IssueAnalyticsRows.length} tau2 issue-linked)`,
        )
      }
    }),
}

export const scoreSeeders: readonly Seeder[] = [seedScores]
