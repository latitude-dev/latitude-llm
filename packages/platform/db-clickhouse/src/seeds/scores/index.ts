import { EvaluationId, ScoreId, SignalId } from "@domain/shared"
import { buildSeedAnchoredAnnotations } from "@domain/shared/seed-content/anchored-annotations"
import {
  TAU2_SEED_TRAJECTORIES,
  tau2TrajectoryIndexForSignalOccurrence,
} from "@domain/shared/seed-content/tau2-trajectories"
import { SEED_SIGNAL_FIXTURES, type SeedScope } from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import { isSentinelPresent } from "../idempotency.ts"
import type { Seeder } from "../types.ts"

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

function createdAtForTau2Signal(scope: SeedScope, signalIndex: number, occurrenceIndex: number): string {
  return scope.timestampDaysAgo(
    (signalIndex * 3 + occurrenceIndex * 5) % 14,
    (signalIndex * 7 + occurrenceIndex * 11) % 24,
    (signalIndex * 13 + occurrenceIndex * 17) % 60,
  )
}

function buildTau2SignalAnalyticsRows(scope: SeedScope, maxTrajectories = TAU2_SEED_TRAJECTORIES.length) {
  const orgId = scope.organizationId
  const projectId = scope.projectId

  return SEED_SIGNAL_FIXTURES.flatMap((_, signalIndex) => {
    const occurrenceCount = signalIndex < 8 ? 12 : 3

    return Array.from({ length: occurrenceCount }, (_, occurrenceIndex) => {
      const trajectoryIndex = tau2TrajectoryIndexForSignalOccurrence({ signalIndex, occurrenceIndex, maxTrajectories })
      const traceId = scope.traceHex("tau2-trajectory", trajectoryIndex)
      return {
        id: ScoreId(scope.cuid(`score:tau2-issue:${signalIndex}:${occurrenceIndex}`)),
        organization_id: orgId,
        project_id: projectId,
        // Matches the session the trajectory's spans roll up to (sessions_mv keys
        // session-less spans by trace_id), so the affected-sessions metric counts them.
        session_id: traceId,
        trace_id: traceId,
        span_id: scope.spanHex("tau2-trajectory-root", trajectoryIndex),
        source: "custom",
        source_id: "tau2-seed-classifier",
        simulation_id: "",
        signal_id: scopedSignalIdByFixtureIndex(scope, signalIndex),
        value: 0.05 + (occurrenceIndex % 4) * 0.03,
        passed: false,
        errored: false,
        duration: 0,
        tokens: 0,
        cost: 0,
        created_at: createdAtForTau2Signal(scope, signalIndex, occurrenceIndex),
      }
    })
  })
}

/** Compatibility lifecycle scores on fixed trace ids (used by trace filter tests and demos). */
export function buildLifecycleAnalyticsRows(scope: SeedScope) {
  const orgId = scope.organizationId
  const projectId = scope.projectId
  const evaluationWarrantyActiveId = EvaluationId(scope.cuid("evaluation:warranty-active"))
  const evaluationCombinationId = EvaluationId(scope.cuid("evaluation:combination"))

  return [
    {
      id: ScoreId(scope.cuid("score:passed")),
      organization_id: orgId,
      project_id: projectId,
      session_id: scope.traceHex("lifecycle", 2),
      trace_id: scope.traceHex("lifecycle", 2),
      span_id: scope.spanHex("lifecycle", 2),
      source: "evaluation",
      source_id: evaluationWarrantyActiveId,
      simulation_id: "",
      signal_id: "",
      value: 0.98,
      passed: true,
      errored: false,
      duration: 850_000_000,
      tokens: 1_820,
      cost: 245_000,
      created_at: scope.timestampDaysAgo(10, 10),
    },
    {
      id: ScoreId(scope.cuid("score:errored")),
      organization_id: orgId,
      project_id: projectId,
      session_id: scope.traceHex("lifecycle", 3),
      trace_id: scope.traceHex("lifecycle", 3),
      span_id: scope.spanHex("lifecycle", 3),
      source: "evaluation",
      source_id: evaluationCombinationId,
      simulation_id: "",
      signal_id: "",
      value: 0,
      passed: false,
      errored: true,
      duration: 120_000_000,
      tokens: 0,
      cost: 0,
      created_at: scope.timestampDaysAgo(9, 11),
    },
    {
      id: ScoreId(scope.cuid("score:api-reviewed")),
      organization_id: orgId,
      project_id: projectId,
      session_id: scope.traceHex("lifecycle", 3),
      trace_id: scope.traceHex("lifecycle", 3),
      span_id: "",
      source: "annotation",
      source_id: "API",
      simulation_id: "",
      signal_id: "",
      value: 0.91,
      passed: true,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: scope.timestampDaysAgo(2, 12, 45),
    },
    {
      id: ScoreId(scope.cuid("score:pending")),
      organization_id: orgId,
      project_id: projectId,
      session_id: scope.traceHex("lifecycle", 4),
      trace_id: scope.traceHex("lifecycle", 4),
      span_id: "",
      source: "custom",
      source_id: "seed-import",
      simulation_id: "",
      signal_id: "",
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

/**
 * Analytics mirror of the seeded flagger annotations. The anchor itself only
 * exists in Postgres (ClickHouse scores carry no metadata); these rows are what
 * put their sessions under the signal in the Sessions list.
 */
function buildAnchoredAnnotationAnalyticsRows(scope: SeedScope, maxTrajectories?: number) {
  const orgId = scope.organizationId
  const projectId = scope.projectId

  return buildSeedAnchoredAnnotations(maxTrajectories).map((annotation) => {
    const traceId = scope.traceHex("tau2-trajectory", annotation.trajectoryIndex)

    return {
      id: ScoreId(scope.cuid(`score:tau2-annotation:${annotation.key}`)),
      organization_id: orgId,
      project_id: projectId,
      session_id: traceId,
      trace_id: traceId,
      span_id: "",
      source: "annotation",
      source_id: "SYSTEM",
      simulation_id: "",
      signal_id: scopedSignalIdByFixtureIndex(scope, annotation.signalIndex),
      value: 0,
      passed: false,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: scope.timestampDaysAgo(annotation.daysAgo, annotation.hour, annotation.minute),
    }
  })
}

function buildAllAnalyticsRows(scope: SeedScope, maxTau2Trajectories?: number) {
  const lifecycleAnalyticsRows = buildLifecycleAnalyticsRows(scope)
  const tau2SignalAnalyticsRows = buildTau2SignalAnalyticsRows(scope, maxTau2Trajectories)

  return {
    lifecycleAnalyticsRows,
    tau2SignalAnalyticsRows,
    all: [...lifecycleAnalyticsRows, ...tau2SignalAnalyticsRows],
  }
}

const seedScores: Seeder = {
  name: "scores/tau2-support-analytics",
  run: (ctx) =>
    Effect.gen(function* () {
      // Sentinel: the first deterministic score id this seeder inserts.
      const sentinel = ScoreId(ctx.scope.cuid("score:tau2-issue:0:0"))
      const present = yield* isSentinelPresent(ctx.client, "scores", "id = {sentinel:String}", { sentinel })
      if (present) {
        if (!ctx.quiet) console.log("  -> scores/tau2-support-analytics: already seeded, skipping")
        return
      }
      const built = buildAllAnalyticsRows(ctx.scope, ctx.maxTau2Trajectories)
      yield* insertJsonEachRow(ctx.client, "scores", built.all)
      if (!ctx.quiet) {
        console.log(
          `  -> scores: ${built.all.length} analytics rows (${built.lifecycleAnalyticsRows.length} lifecycle; ${built.tau2SignalAnalyticsRows.length} tau2 issue-linked)`,
        )
      }
    }),
}

// Own sentinel: `scores` has no row-level dedup, so picking these up must not re-insert the tau2 rows.
const seedAnchoredAnnotations: Seeder = {
  name: "scores/tau2-flagger-annotations",
  run: (ctx) =>
    Effect.gen(function* () {
      const rows = buildAnchoredAnnotationAnalyticsRows(ctx.scope, ctx.maxTau2Trajectories)
      const sentinel = rows[0]?.id
      if (sentinel === undefined) return
      const present = yield* isSentinelPresent(ctx.client, "scores", "id = {sentinel:String}", { sentinel })
      if (present) {
        if (!ctx.quiet) console.log("  -> scores/tau2-flagger-annotations: already seeded, skipping")
        return
      }
      yield* insertJsonEachRow(ctx.client, "scores", rows)
      if (!ctx.quiet) console.log(`  -> scores: ${rows.length} flagger annotation analytics rows`)
    }),
}

export const scoreSeeders: readonly Seeder[] = [seedScores, seedAnchoredAnnotations]
