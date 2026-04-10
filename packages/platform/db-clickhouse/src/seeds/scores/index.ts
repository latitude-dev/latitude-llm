import {
  ALL_ANNOTATION_TRACE_DAYS_AGO,
  ALL_ISSUE_1_TRACES,
  ALL_ISSUE_2_TRACES,
  ALL_ISSUE_3_TRACES,
  type AnnotationTrace,
  ISSUE_2_ADDITIONAL_NEGATIVES,
  SEED_ADDITIONAL_ISSUE_OCCURRENCES,
  SEED_ALIGNMENT_FIXTURE_SPAN_IDS,
  SEED_ALIGNMENT_FIXTURE_TRACE_IDS,
  SEED_ANNOTATION_QUEUE_COMBINATION_ID,
  SEED_ANNOTATION_QUEUE_LOGISTICS_ID,
  SEED_ANNOTATION_QUEUE_WARRANTY_ID,
  SEED_ANNOTATION_SPAN_IDS,
  SEED_ANNOTATION_TRACE_IDS,
  SEED_COMBINATION_EVALUATION_ID,
  SEED_COMBINATION_ISSUE_ID,
  SEED_COMBINATION_SIMULATION_SPAN_IDS,
  SEED_COMBINATION_SIMULATION_TRACE_IDS,
  SEED_EVALUATION_ARCHIVED_ID,
  SEED_EVALUATION_ID,
  SEED_GENERATE_ISSUE_ID,
  SEED_ISSUE_ID,
  SEED_LIFECYCLE_SPAN_IDS,
  SEED_LIFECYCLE_TRACE_IDS,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_SCORE_API_REVIEWED_ID,
  SEED_SCORE_COMBINATION_SIMULATION_ID,
  SEED_SCORE_ERRORED_ID,
  SEED_SCORE_PASSED_ID,
  SEED_SCORE_PENDING_ID,
  SEED_SCORE_WARRANTY_SIMULATION_ACTIVE_ID,
  SEED_SCORE_WARRANTY_SIMULATION_ARCHIVED_ID,
  SEED_SIMULATION_ID,
  SEED_WARRANTY_SIMULATION_ID,
  SEED_WARRANTY_SIMULATION_SPAN_IDS,
  SEED_WARRANTY_SIMULATION_TRACE_IDS,
  seedTimestampDaysAgo,
} from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import type { Seeder } from "../types.ts"

function seedScoreId(prefix: string, index: number): string {
  return `${prefix}${index.toString().padStart(3, "0")}${"x".repeat(24 - prefix.length - 3)}`
}

function requiredAt<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (item === undefined) {
    throw new Error(`Missing seeded item at index ${index}`)
  }
  return item
}

function createdAtFromDaysAgo(daysAgo: number, hour: number, minute = 0): string {
  return seedTimestampDaysAgo(daysAgo, hour, minute)
}

function annotationValue(passed: boolean, tier: string): number {
  if (!passed) {
    return tier === "obvious" || tier === "easy" ? 0.04 : tier === "subtle" || tier === "medium" ? 0.08 : 0.12
  }

  return tier === "obvious" || tier === "easy" ? 0.99 : tier === "subtle" || tier === "medium" ? 0.96 : 0.93
}

const lifecycleAnalyticsRows = [
  {
    id: SEED_SCORE_PASSED_ID,
    organization_id: SEED_ORG_ID,
    project_id: SEED_PROJECT_ID,
    session_id: "",
    trace_id: requiredAt(SEED_LIFECYCLE_TRACE_IDS, 2),
    span_id: requiredAt(SEED_LIFECYCLE_SPAN_IDS, 2),
    source: "evaluation",
    source_id: SEED_EVALUATION_ID,
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
    id: SEED_SCORE_ERRORED_ID,
    organization_id: SEED_ORG_ID,
    project_id: SEED_PROJECT_ID,
    session_id: "",
    trace_id: requiredAt(SEED_LIFECYCLE_TRACE_IDS, 3),
    span_id: requiredAt(SEED_LIFECYCLE_SPAN_IDS, 3),
    source: "evaluation",
    source_id: SEED_COMBINATION_EVALUATION_ID,
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
    id: SEED_SCORE_API_REVIEWED_ID,
    organization_id: SEED_ORG_ID,
    project_id: SEED_PROJECT_ID,
    session_id: "",
    trace_id: requiredAt(SEED_LIFECYCLE_TRACE_IDS, 3),
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
    id: SEED_SCORE_PENDING_ID,
    organization_id: SEED_ORG_ID,
    project_id: SEED_PROJECT_ID,
    session_id: "",
    trace_id: requiredAt(SEED_LIFECYCLE_TRACE_IDS, 4),
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
      id: seedScoreId(opts.prefix, i),
      organization_id: SEED_ORG_ID,
      project_id: SEED_PROJECT_ID,
      session_id: "",
      trace_id: requiredAt(SEED_ANNOTATION_TRACE_IDS, opts.offset + i),
      span_id: requiredAt(SEED_ANNOTATION_SPAN_IDS, opts.offset + i),
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
  queueId: SEED_ANNOTATION_QUEUE_WARRANTY_ID,
  issueId: SEED_ISSUE_ID,
  prefix: "i1",
  daysAgo: ALL_ANNOTATION_TRACE_DAYS_AGO.slice(0, ALL_ISSUE_1_TRACES.length),
})

const issue2AnnotationAnalyticsRows = buildIssueAnnotationAnalyticsRows({
  traces: ALL_ISSUE_2_TRACES,
  offset: ALL_ISSUE_1_TRACES.length,
  queueId: SEED_ANNOTATION_QUEUE_COMBINATION_ID,
  issueId: SEED_COMBINATION_ISSUE_ID,
  prefix: "i2",
  daysAgo: ALL_ANNOTATION_TRACE_DAYS_AGO.slice(ALL_ISSUE_1_TRACES.length, ALL_ISSUE_1_TRACES.length + ALL_ISSUE_2_TRACES.length),
})

const issue3AnnotationAnalyticsRows = buildIssueAnnotationAnalyticsRows({
  traces: ALL_ISSUE_3_TRACES,
  offset: ALL_ISSUE_1_TRACES.length + ALL_ISSUE_2_TRACES.length,
  queueId: SEED_ANNOTATION_QUEUE_LOGISTICS_ID,
  issueId: SEED_GENERATE_ISSUE_ID,
  prefix: "i3",
  daysAgo: ALL_ANNOTATION_TRACE_DAYS_AGO.slice(ALL_ISSUE_1_TRACES.length + ALL_ISSUE_2_TRACES.length),
})

const alignmentAnalyticsRows = ISSUE_2_ADDITIONAL_NEGATIVES.map((fixture, i) => ({
  id: seedScoreId("al", i),
  organization_id: SEED_ORG_ID,
  project_id: SEED_PROJECT_ID,
  session_id: "",
  trace_id: requiredAt(SEED_ALIGNMENT_FIXTURE_TRACE_IDS, i),
  span_id: requiredAt(SEED_ALIGNMENT_FIXTURE_SPAN_IDS, i),
  source: fixture.source,
  source_id:
    fixture.source === "annotation"
      ? SEED_ANNOTATION_QUEUE_COMBINATION_ID
      : fixture.source === "evaluation"
        ? SEED_COMBINATION_EVALUATION_ID
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
    id: SEED_SCORE_WARRANTY_SIMULATION_ACTIVE_ID,
    organization_id: SEED_ORG_ID,
    project_id: SEED_PROJECT_ID,
    session_id: "",
    trace_id: requiredAt(SEED_WARRANTY_SIMULATION_TRACE_IDS, 0),
    span_id: requiredAt(SEED_WARRANTY_SIMULATION_SPAN_IDS, 0),
    source: "evaluation",
    source_id: SEED_EVALUATION_ID,
    simulation_id: SEED_WARRANTY_SIMULATION_ID,
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
    id: SEED_SCORE_WARRANTY_SIMULATION_ARCHIVED_ID,
    organization_id: SEED_ORG_ID,
    project_id: SEED_PROJECT_ID,
    session_id: "",
    trace_id: requiredAt(SEED_WARRANTY_SIMULATION_TRACE_IDS, 1),
    span_id: requiredAt(SEED_WARRANTY_SIMULATION_SPAN_IDS, 1),
    source: "evaluation",
    source_id: SEED_EVALUATION_ARCHIVED_ID,
    simulation_id: SEED_WARRANTY_SIMULATION_ID,
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
    id: SEED_SCORE_COMBINATION_SIMULATION_ID,
    organization_id: SEED_ORG_ID,
    project_id: SEED_PROJECT_ID,
    session_id: "",
    trace_id: requiredAt(SEED_COMBINATION_SIMULATION_TRACE_IDS, 0),
    span_id: requiredAt(SEED_COMBINATION_SIMULATION_SPAN_IDS, 0),
    source: "evaluation",
    source_id: SEED_COMBINATION_EVALUATION_ID,
    simulation_id: SEED_SIMULATION_ID,
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

const issueOccurrenceAnalyticsRows = SEED_ADDITIONAL_ISSUE_OCCURRENCES.map((occurrence, i) => ({
  id: seedScoreId(occurrence.idPrefix, i),
  organization_id: SEED_ORG_ID,
  project_id: SEED_PROJECT_ID,
  session_id: "",
  trace_id: "",
  span_id: "",
  source: occurrence.source,
  source_id: occurrence.sourceId,
  simulation_id: "",
  issue_id: occurrence.issueId,
  value: occurrence.value,
  passed: occurrence.passed,
  errored: occurrence.errored,
  duration: occurrence.duration,
  tokens: occurrence.tokens,
  cost: occurrence.cost,
  created_at: createdAtFromDaysAgo(occurrence.daysAgo, occurrence.hour, occurrence.minute),
}))

const allAnalyticsRows = [
  ...lifecycleAnalyticsRows,
  ...issue1AnnotationAnalyticsRows,
  ...issue2AnnotationAnalyticsRows,
  ...issue3AnnotationAnalyticsRows,
  ...issueOccurrenceAnalyticsRows,
  ...alignmentAnalyticsRows,
  ...simulationAnalyticsRows,
]

const seedScores: Seeder = {
  name: "scores/acme-support-analytics",
  run: (ctx) =>
    insertJsonEachRow(ctx.client, "scores", allAnalyticsRows).pipe(
      Effect.tap(() =>
        Effect.sync(() =>
          console.log(
            `  -> scores: ${allAnalyticsRows.length} analytics rows (${lifecycleAnalyticsRows.length} lifecycle, ${
              issue1AnnotationAnalyticsRows.length +
              issue2AnnotationAnalyticsRows.length +
              issue3AnnotationAnalyticsRows.length
            } annotations, ${issueOccurrenceAnalyticsRows.length} issue occurrences, ${alignmentAnalyticsRows.length} alignment, ${simulationAnalyticsRows.length} simulation)`,
          ),
        ),
      ),
    ),
}

export const scoreSeeders: readonly Seeder[] = [seedScores]
