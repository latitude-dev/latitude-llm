import { EvaluationId, IssueId, ScoreId, SimulationId } from "@domain/shared"
import {
  ALL_ANNOTATION_TRACE_DAYS_AGO,
  ALL_ISSUE_1_TRACES,
  ALL_ISSUE_2_TRACES,
  ALL_ISSUE_3_TRACES,
  type AnnotationTrace,
  ISSUE_2_ADDITIONAL_NEGATIVES,
  SEED_ACCESS_ISSUE_ID,
  SEED_ADDITIONAL_ISSUE_OCCURRENCES,
  SEED_BILLING_ISSUE_ID,
  SEED_COMBINATION_ISSUE_ID,
  SEED_EXTRA_ISSUE_IDS,
  SEED_FLAGGER_ISSUE_ID,
  SEED_GENERATE_ISSUE_ID,
  SEED_INSTALLATION_ISSUE_ID,
  SEED_ISSUE_ID,
  SEED_RETURNS_ISSUE_ID,
  type SeedScope,
  seedTimestampDaysAgo,
} from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import type { Seeder } from "../types.ts"


function createdAtFromDaysAgo(daysAgo: number, hour: number, minute = 0): string {
  return seedTimestampDaysAgo(daysAgo, hour, minute)
}

function annotationSeedSourceId(sourceId: string): "UI" | "API" {
  if (sourceId === "seed-issue-scout") return "UI"
  return "API"
}

function annotationValue(passed: boolean, tier: string): number {
  if (!passed) {
    return tier === "obvious" || tier === "easy" ? 0.04 : tier === "subtle" || tier === "medium" ? 0.08 : 0.12
  }

  return tier === "obvious" || tier === "easy" ? 0.99 : tier === "subtle" || tier === "medium" ? 0.96 : 0.93
}

/**
 * Map literal `SEED_*_ISSUE_ID` constants embedded in `SEED_ADDITIONAL_ISSUE_OCCURRENCES`
 * back to scope-derived ids.
 */
function remapFixtureIssueId(literalIssueId: string, scope: SeedScope): string {
  switch (literalIssueId) {
    case SEED_ISSUE_ID:
      return IssueId(scope.cuid("issue:warranty-fab"))
    case SEED_COMBINATION_ISSUE_ID:
      return IssueId(scope.cuid("issue:combination"))
    case SEED_GENERATE_ISSUE_ID:
      return IssueId(scope.cuid("issue:logistics"))
    case SEED_RETURNS_ISSUE_ID:
      return IssueId(scope.cuid("issue:returns"))
    case SEED_BILLING_ISSUE_ID:
      return IssueId(scope.cuid("issue:billing"))
    case SEED_ACCESS_ISSUE_ID:
      return IssueId(scope.cuid("issue:access"))
    case SEED_INSTALLATION_ISSUE_ID:
      return IssueId(scope.cuid("issue:installation"))
    case SEED_FLAGGER_ISSUE_ID:
      return IssueId(scope.cuid("issue:flagger"))
    default: {
      // Long-tail extras: SEED_EXTRA_ISSUE_IDS[i] → "issue:extra:${i}".
      const extraIndex = SEED_EXTRA_ISSUE_IDS.indexOf(literalIssueId as (typeof SEED_EXTRA_ISSUE_IDS)[number])
      if (extraIndex >= 0) {
        return IssueId(scope.cuid(`issue:extra:${extraIndex}`))
      }
      throw new Error(`Unmapped fixture issueId literal: ${literalIssueId}`)
    }
  }
}

function buildAllAnalyticsRows(scope: SeedScope) {
  const orgId = scope.organizationId
  const projectId = scope.projectId

  const evaluationWarrantyActiveId = EvaluationId(scope.cuid("evaluation:warranty-active"))
  const evaluationWarrantyArchivedId = EvaluationId(scope.cuid("evaluation:warranty-archived"))
  const evaluationCombinationId = EvaluationId(scope.cuid("evaluation:combination"))

  const queueWarrantyId = scope.cuid("queue:warranty")
  const queueCombinationId = scope.cuid("queue:combination")
  const queueLogisticsId = scope.cuid("queue:logistics")
  const queueKitchenSinkId = scope.cuid("queue:kitchen-sink")

  const issueWarrantyFab = IssueId(scope.cuid("issue:warranty-fab"))
  const issueCombination = IssueId(scope.cuid("issue:combination"))
  const issueLogistics = IssueId(scope.cuid("issue:logistics"))

  const warrantySimulationId = SimulationId(scope.cuid("simulation:warranty"))
  const combinationSimulationId = SimulationId(scope.cuid("simulation:combination"))

  const annotationDemoTraceId = scope.traceHex("annotation-demo", 0)
  const annotationDemoSpanId = scope.spanHex("annotation-demo", 0)

  const lifecycleAnalyticsRows = [
    {
      id: ScoreId(scope.cuid("score:passed")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: scope.traceHex("lifecycle", 2),
      span_id: scope.spanHex("lifecycle", 2),
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
      created_at: createdAtFromDaysAgo(10, 10),
    },
    {
      id: ScoreId(scope.cuid("score:errored")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: scope.traceHex("lifecycle", 3),
      span_id: scope.spanHex("lifecycle", 3),
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
      created_at: createdAtFromDaysAgo(9, 11),
    },
    {
      id: ScoreId(scope.cuid("score:api-reviewed")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: scope.traceHex("lifecycle", 3),
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
      created_at: createdAtFromDaysAgo(2, 12, 45),
    },
    {
      id: ScoreId(scope.cuid("score:pending")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: scope.traceHex("lifecycle", 4),
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
      created_at: createdAtFromDaysAgo(1, 8, 30),
    },
  ]

  function buildIssueAnnotationAnalyticsRows(opts: {
    traces: readonly AnnotationTrace[]
    offset: number
    queueId: string
    issueId: string
    prefix: string
    daysAgo: readonly number[]
  }) {
    return opts.traces.map((trace, i) => {
      const dayOffset = opts.daysAgo[i]
      if (dayOffset === undefined) {
        throw new Error(`Missing seeded annotation day for ${opts.prefix} index ${i}`)
      }

      return {
        id: ScoreId(scope.cuid(`score:${opts.prefix}:${i}`)),
        organization_id: orgId,
        project_id: projectId,
        session_id: "",
        trace_id: scope.traceHex("annotation", opts.offset + i),
        span_id: scope.spanHex("annotation", opts.offset + i),
        source: "annotation",
        source_id: opts.queueId,
        simulation_id: "",
        issue_id: trace.passed ? "" : opts.issueId,
        value: annotationValue(trace.passed, trace.tier),
        passed: trace.passed,
        errored: false,
        duration: 0,
        tokens: 0,
        cost: 0,
        created_at: createdAtFromDaysAgo(dayOffset, 9 + (i % 4)),
      }
    })
  }

  const issue1AnnotationAnalyticsRows = buildIssueAnnotationAnalyticsRows({
    traces: ALL_ISSUE_1_TRACES,
    offset: 0,
    queueId: queueWarrantyId,
    issueId: issueWarrantyFab,
    prefix: "i1",
    daysAgo: ALL_ANNOTATION_TRACE_DAYS_AGO.slice(0, ALL_ISSUE_1_TRACES.length),
  })

  const issue2AnnotationAnalyticsRows = buildIssueAnnotationAnalyticsRows({
    traces: ALL_ISSUE_2_TRACES,
    offset: ALL_ISSUE_1_TRACES.length,
    queueId: queueCombinationId,
    issueId: issueCombination,
    prefix: "i2",
    daysAgo: ALL_ANNOTATION_TRACE_DAYS_AGO.slice(
      ALL_ISSUE_1_TRACES.length,
      ALL_ISSUE_1_TRACES.length + ALL_ISSUE_2_TRACES.length,
    ),
  })

  const issue3AnnotationAnalyticsRows = buildIssueAnnotationAnalyticsRows({
    traces: ALL_ISSUE_3_TRACES,
    offset: ALL_ISSUE_1_TRACES.length + ALL_ISSUE_2_TRACES.length,
    queueId: queueLogisticsId,
    issueId: issueLogistics,
    prefix: "i3",
    daysAgo: ALL_ANNOTATION_TRACE_DAYS_AGO.slice(ALL_ISSUE_1_TRACES.length + ALL_ISSUE_2_TRACES.length),
  })

  const alignmentAnalyticsRows = ISSUE_2_ADDITIONAL_NEGATIVES.map((fixture, i) => ({
    id: ScoreId(scope.cuid(`score:al:${i}`)),
    organization_id: orgId,
    project_id: projectId,
    session_id: "",
    trace_id: scope.traceHex("alignment-fixture", i),
    span_id: scope.spanHex("alignment-fixture", i),
    source: fixture.source,
    source_id:
      fixture.source === "annotation"
        ? queueCombinationId
        : fixture.source === "evaluation"
          ? evaluationCombinationId
          : "seed-import",
    simulation_id: "",
    issue_id: "",
    value: 0.95,
    passed: true,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    created_at: createdAtFromDaysAgo(26 - Math.floor(i / 5), 10 + (i % 5)),
  }))

  const simulationAnalyticsRows = [
    {
      id: ScoreId(scope.cuid("score:warranty-simulation-active")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: scope.traceHex("warranty-simulation", 0),
      span_id: scope.spanHex("warranty-simulation", 0),
      source: "evaluation",
      source_id: evaluationWarrantyActiveId,
      simulation_id: warrantySimulationId,
      issue_id: "",
      value: 0.97,
      passed: true,
      errored: false,
      duration: 920_000_000,
      tokens: 2_140,
      cost: 312_000,
      created_at: createdAtFromDaysAgo(6, 9, 6),
    },
    {
      id: ScoreId(scope.cuid("score:warranty-simulation-archived")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: scope.traceHex("warranty-simulation", 1),
      span_id: scope.spanHex("warranty-simulation", 1),
      source: "evaluation",
      source_id: evaluationWarrantyArchivedId,
      simulation_id: warrantySimulationId,
      issue_id: "",
      value: 0.92,
      passed: true,
      errored: false,
      duration: 880_000_000,
      tokens: 1_960,
      cost: 287_000,
      created_at: createdAtFromDaysAgo(6, 9, 7),
    },
    {
      id: ScoreId(scope.cuid("score:combination-simulation")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: scope.traceHex("combination-simulation", 0),
      span_id: scope.spanHex("combination-simulation", 0),
      source: "evaluation",
      source_id: evaluationCombinationId,
      simulation_id: combinationSimulationId,
      issue_id: "",
      value: 0.98,
      passed: true,
      errored: false,
      duration: 940_000_000,
      tokens: 2_220,
      cost: 325_000,
      created_at: createdAtFromDaysAgo(4, 13, 24),
    },
  ] as const

  const uiPolishAnalyticsRows = [
    {
      id: ScoreId(scope.cuid("score:ui-polish:human-draft-1")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: annotationDemoTraceId,
      span_id: annotationDemoSpanId,
      source: "annotation",
      source_id: "UI",
      simulation_id: "",
      issue_id: "",
      value: 0.3,
      passed: false,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: createdAtFromDaysAgo(1, 10),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:human-draft-2")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: annotationDemoTraceId,
      span_id: annotationDemoSpanId,
      source: "annotation",
      source_id: "UI",
      simulation_id: "",
      issue_id: "",
      value: 0.5,
      passed: false,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: createdAtFromDaysAgo(1, 11),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:human-draft-3")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: annotationDemoTraceId,
      span_id: "",
      source: "annotation",
      source_id: "UI",
      simulation_id: "",
      issue_id: "",
      value: 0.8,
      passed: true,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: createdAtFromDaysAgo(1, 12),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:human-published-1")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: annotationDemoTraceId,
      span_id: annotationDemoSpanId,
      source: "annotation",
      source_id: "UI",
      simulation_id: "",
      issue_id: "",
      value: 0.95,
      passed: true,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: createdAtFromDaysAgo(5, 9),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:human-published-2")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: annotationDemoTraceId,
      span_id: annotationDemoSpanId,
      source: "annotation",
      source_id: "UI",
      simulation_id: "",
      issue_id: "",
      value: 0.1,
      passed: false,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: createdAtFromDaysAgo(6, 14),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:human-published-3")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: annotationDemoTraceId,
      span_id: "",
      source: "annotation",
      source_id: "UI",
      simulation_id: "",
      issue_id: "",
      value: 0.88,
      passed: true,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: createdAtFromDaysAgo(7, 11),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:agent-draft-1")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: annotationDemoTraceId,
      span_id: annotationDemoSpanId,
      source: "annotation",
      source_id: queueKitchenSinkId,
      simulation_id: "",
      issue_id: "",
      value: 0.25,
      passed: false,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: createdAtFromDaysAgo(0, 8),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:agent-draft-2")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: annotationDemoTraceId,
      span_id: annotationDemoSpanId,
      source: "annotation",
      source_id: queueKitchenSinkId,
      simulation_id: "",
      issue_id: "",
      value: 0.4,
      passed: false,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: createdAtFromDaysAgo(0, 9),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:agent-draft-3")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: annotationDemoTraceId,
      span_id: "",
      source: "annotation",
      source_id: queueKitchenSinkId,
      simulation_id: "",
      issue_id: "",
      value: 0.6,
      passed: true,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: createdAtFromDaysAgo(0, 10),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:agent-published-1")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: annotationDemoTraceId,
      span_id: annotationDemoSpanId,
      source: "annotation",
      source_id: queueKitchenSinkId,
      simulation_id: "",
      issue_id: "",
      value: 0.92,
      passed: true,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: createdAtFromDaysAgo(3, 15),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:agent-published-2")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: annotationDemoTraceId,
      span_id: "",
      source: "annotation",
      source_id: queueKitchenSinkId,
      simulation_id: "",
      issue_id: "",
      value: 0.85,
      passed: true,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: createdAtFromDaysAgo(4, 16),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:api-published-1")),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: annotationDemoTraceId,
      span_id: annotationDemoSpanId,
      source: "annotation",
      source_id: "API",
      simulation_id: "",
      issue_id: "",
      value: 0.78,
      passed: true,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      created_at: createdAtFromDaysAgo(2, 13),
    },
  ] as const

  const issueOccurrenceAnalyticsRows = SEED_ADDITIONAL_ISSUE_OCCURRENCES.map((occurrence, i) => {
    const seededSource =
      occurrence.source === "custom"
        ? {
            source: "annotation" as const,
            sourceId: annotationSeedSourceId(occurrence.sourceId),
          }
        : {
            source: occurrence.source,
            sourceId: occurrence.sourceId,
          }

    return {
      id: ScoreId(scope.cuid(`score:${occurrence.idPrefix}:${i}`)),
      organization_id: orgId,
      project_id: projectId,
      session_id: "",
      trace_id: scope.traceHex("issue-occurrence", i),
      span_id: scope.spanHex("issue-occurrence", i),
      source: seededSource.source,
      source_id: seededSource.sourceId,
      simulation_id: "",
      issue_id: remapFixtureIssueId(occurrence.issueId, scope),
      value: occurrence.value,
      passed: occurrence.passed,
      errored: occurrence.errored,
      duration: occurrence.duration,
      tokens: occurrence.tokens,
      cost: occurrence.cost,
      created_at: createdAtFromDaysAgo(occurrence.daysAgo, occurrence.hour, occurrence.minute),
    }
  })

  return {
    lifecycleAnalyticsRows,
    issue1AnnotationAnalyticsRows,
    issue2AnnotationAnalyticsRows,
    issue3AnnotationAnalyticsRows,
    issueOccurrenceAnalyticsRows,
    alignmentAnalyticsRows,
    simulationAnalyticsRows,
    uiPolishAnalyticsRows,
    all: [
      ...lifecycleAnalyticsRows,
      ...issue1AnnotationAnalyticsRows,
      ...issue2AnnotationAnalyticsRows,
      ...issue3AnnotationAnalyticsRows,
      ...issueOccurrenceAnalyticsRows,
      ...alignmentAnalyticsRows,
      ...simulationAnalyticsRows,
      ...uiPolishAnalyticsRows,
    ],
  }
}

const seedScores: Seeder = {
  name: "scores/acme-support-analytics",
  run: (ctx) => {
    const built = buildAllAnalyticsRows(ctx.scope)
    return insertJsonEachRow(ctx.client, "scores", built.all).pipe(
      Effect.tap(() =>
        Effect.sync(() =>
          console.log(
            `  -> scores: ${built.all.length} analytics rows (${built.lifecycleAnalyticsRows.length} lifecycle, ${
              built.issue1AnnotationAnalyticsRows.length +
              built.issue2AnnotationAnalyticsRows.length +
              built.issue3AnnotationAnalyticsRows.length
            } annotations, ${built.issueOccurrenceAnalyticsRows.length} issue occurrences, ${built.alignmentAnalyticsRows.length} alignment, ${built.simulationAnalyticsRows.length} simulation, ${built.uiPolishAnalyticsRows.length} UI polish demo)`,
          ),
        ),
      ),
    )
  },
}

export const scoreSeeders: readonly Seeder[] = [seedScores]
