import {
  ALL_ANNOTATION_TRACE_DAYS_AGO,
  ALL_ISSUE_1_TRACES,
  ALL_ISSUE_2_TRACES,
  ALL_ISSUE_3_TRACES,
  type AnnotationTrace,
  ISSUE_2_ADDITIONAL_NEGATIVES,
  ScoreId,
  SEED_ADDITIONAL_ISSUE_OCCURRENCES,
  SEED_ALIGNMENT_FIXTURE_SPAN_IDS,
  SEED_ALIGNMENT_FIXTURE_TRACE_IDS,
  SEED_ANNOTATION_QUEUE_COMBINATION_ID,
  SEED_ANNOTATION_QUEUE_LOGISTICS_ID,
  SEED_ANNOTATION_QUEUE_WARRANTY_ID,
  SEED_ANNOTATION_SPAN_IDS,
  SEED_ANNOTATION_TRACE_IDS,
  SEED_COMBINATION_EVALUATION_HASH,
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
  SEED_SCORE_DRAFT_ID,
  SEED_SCORE_ERRORED_ID,
  SEED_SCORE_PASSED_ID,
  SEED_SCORE_PENDING_ID,
  SEED_SCORE_WARRANTY_SIMULATION_ACTIVE_ID,
  SEED_SCORE_WARRANTY_SIMULATION_ARCHIVED_ID,
  SEED_SIMULATION_ID,
  SEED_WARRANTY_ARCHIVED_EVALUATION_HASH,
  SEED_WARRANTY_EVALUATION_HASH,
  SEED_WARRANTY_SIMULATION_ID,
  SEED_WARRANTY_SIMULATION_SPAN_IDS,
  SEED_WARRANTY_SIMULATION_TRACE_IDS,
  seedDateDaysAgo,
  seedIssueOccurrenceSpanId,
  seedIssueOccurrenceTraceId,
} from "@domain/shared/seeding"
import { Effect } from "effect"
import { scores } from "../../schema/scores.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

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

function createdAtFromDaysAgo(daysAgo: number, hour: number, minute = 0): Date {
  return seedDateDaysAgo(daysAgo, hour, minute)
}

function annotationSeedSourceId(sourceId: string): "UI" | "API" {
  return sourceId === "seed-issue-scout" ? "UI" : "API"
}

function annotationValue(passed: boolean, tier: string): number {
  if (!passed) {
    return tier === "obvious" || tier === "easy" ? 0.04 : tier === "subtle" || tier === "medium" ? 0.08 : 0.12
  }

  return tier === "obvious" || tier === "easy" ? 0.99 : tier === "subtle" || tier === "medium" ? 0.96 : 0.93
}

const lifecycleScoreRows = [
  {
    id: SEED_SCORE_PASSED_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    sessionId: null,
    traceId: requiredAt(SEED_LIFECYCLE_TRACE_IDS, 2),
    spanId: requiredAt(SEED_LIFECYCLE_SPAN_IDS, 2),
    source: "evaluation" as const,
    sourceId: SEED_EVALUATION_ID,
    simulationId: null,
    issueId: null,
    value: 0.98,
    passed: true,
    feedback: "The agent correctly cited the warranty exclusion and did not promise coverage.",
    metadata: { evaluationHash: SEED_WARRANTY_EVALUATION_HASH },
    error: null,
    errored: false,
    duration: 850_000_000,
    tokens: 1_820,
    cost: 245_000,
    draftedAt: null,
    createdAt: createdAtFromDaysAgo(10, 10),
    updatedAt: createdAtFromDaysAgo(10, 10),
  },
  {
    id: SEED_SCORE_ERRORED_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    sessionId: null,
    traceId: requiredAt(SEED_LIFECYCLE_TRACE_IDS, 3),
    spanId: requiredAt(SEED_LIFECYCLE_SPAN_IDS, 3),
    source: "evaluation" as const,
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    simulationId: null,
    issueId: null,
    value: 0,
    passed: false,
    feedback: "Score generation errored before the dangerous-combination monitor produced a verdict.",
    metadata: { evaluationHash: SEED_COMBINATION_EVALUATION_HASH },
    error: "Evaluator request timed out while scoring the trace.",
    errored: true,
    duration: 120_000_000,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    createdAt: createdAtFromDaysAgo(9, 11),
    updatedAt: createdAtFromDaysAgo(9, 11),
  },
  {
    id: SEED_SCORE_DRAFT_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    sessionId: null,
    traceId: requiredAt(SEED_LIFECYCLE_TRACE_IDS, 2),
    spanId: requiredAt(SEED_LIFECYCLE_SPAN_IDS, 2),
    source: "annotation" as const,
    sourceId: "UI",
    simulationId: null,
    issueId: null,
    value: 0.4,
    passed: false,
    feedback: "The response needs human review before final publication.",
    metadata: {
      rawFeedback: "Review this answer for a possible warranty fabrication.",
      messageIndex: 1,
      partIndex: 0,
      startOffset: 12,
      endOffset: 38,
    },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: createdAtFromDaysAgo(3, 9, 5),
    createdAt: createdAtFromDaysAgo(3, 9),
    updatedAt: createdAtFromDaysAgo(3, 9, 5),
  },
  {
    id: SEED_SCORE_API_REVIEWED_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    sessionId: null,
    traceId: requiredAt(SEED_LIFECYCLE_TRACE_IDS, 3),
    spanId: null,
    source: "annotation" as const,
    sourceId: "API",
    simulationId: null,
    issueId: null,
    value: 0.91,
    passed: true,
    feedback: "The agent correctly explained the blast radius without fabricating information.",
    metadata: {
      rawFeedback: "This answer is correct and grounded in the product data sheet.",
    },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    createdAt: createdAtFromDaysAgo(2, 12, 45),
    updatedAt: createdAtFromDaysAgo(2, 12, 45),
  },
  {
    id: SEED_SCORE_PENDING_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    sessionId: null,
    traceId: requiredAt(SEED_LIFECYCLE_TRACE_IDS, 4),
    spanId: null,
    source: "custom" as const,
    sourceId: "seed-import",
    simulationId: null,
    issueId: null,
    value: 0.88,
    passed: true,
    feedback: "The agent provided a correct order status update.",
    metadata: { reviewer: "qa", importName: "seed-import" },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    createdAt: createdAtFromDaysAgo(1, 8, 30),
    updatedAt: createdAtFromDaysAgo(1, 8, 30),
  },
] as const

function buildIssueAnnotationScoreRows(opts: {
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
    const createdAt = createdAtFromDaysAgo(dayOffset, 9 + (i % 4))

    return {
      id: ScoreId(seedScoreId(opts.prefix, i)),
      organizationId: SEED_ORG_ID,
      projectId: SEED_PROJECT_ID,
      sessionId: null,
      traceId: requiredAt(SEED_ANNOTATION_TRACE_IDS, opts.offset + i),
      spanId: requiredAt(SEED_ANNOTATION_SPAN_IDS, opts.offset + i),
      source: "annotation" as const,
      sourceId: opts.queueId,
      simulationId: null,
      issueId: trace.passed ? null : opts.issueId,
      value: annotationValue(trace.passed, trace.tier),
      passed: trace.passed,
      feedback: trace.feedback,
      metadata: {
        rawFeedback: trace.feedback,
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

const issue1AnnotationScoreRows = buildIssueAnnotationScoreRows({
  traces: ALL_ISSUE_1_TRACES,
  offset: 0,
  queueId: SEED_ANNOTATION_QUEUE_WARRANTY_ID,
  issueId: SEED_ISSUE_ID,
  prefix: "i1",
  daysAgo: ALL_ANNOTATION_TRACE_DAYS_AGO.slice(0, ALL_ISSUE_1_TRACES.length),
})

const issue2AnnotationScoreRows = buildIssueAnnotationScoreRows({
  traces: ALL_ISSUE_2_TRACES,
  offset: ALL_ISSUE_1_TRACES.length,
  queueId: SEED_ANNOTATION_QUEUE_COMBINATION_ID,
  issueId: SEED_COMBINATION_ISSUE_ID,
  prefix: "i2",
  daysAgo: ALL_ANNOTATION_TRACE_DAYS_AGO.slice(
    ALL_ISSUE_1_TRACES.length,
    ALL_ISSUE_1_TRACES.length + ALL_ISSUE_2_TRACES.length,
  ),
})

const issue3AnnotationScoreRows = buildIssueAnnotationScoreRows({
  traces: ALL_ISSUE_3_TRACES,
  offset: ALL_ISSUE_1_TRACES.length + ALL_ISSUE_2_TRACES.length,
  queueId: SEED_ANNOTATION_QUEUE_LOGISTICS_ID,
  issueId: SEED_GENERATE_ISSUE_ID,
  prefix: "i3",
  daysAgo: ALL_ANNOTATION_TRACE_DAYS_AGO.slice(ALL_ISSUE_1_TRACES.length + ALL_ISSUE_2_TRACES.length),
})

const alignmentFixtureScoreRows = ISSUE_2_ADDITIONAL_NEGATIVES.map((fixture, i) => {
  const createdAt = createdAtFromDaysAgo(26 - Math.floor(i / 5), 10 + (i % 5))
  const sourceId =
    fixture.source === "annotation"
      ? SEED_ANNOTATION_QUEUE_COMBINATION_ID
      : fixture.source === "evaluation"
        ? SEED_COMBINATION_EVALUATION_ID
        : "seed-import"

  const metadata =
    fixture.source === "annotation"
      ? { rawFeedback: fixture.feedback }
      : fixture.source === "evaluation"
        ? { evaluationHash: SEED_COMBINATION_EVALUATION_HASH }
        : { importName: "seed-import", tier: fixture.tier }

  return {
    id: ScoreId(seedScoreId("al", i)),
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    sessionId: null,
    traceId: requiredAt(SEED_ALIGNMENT_FIXTURE_TRACE_IDS, i),
    spanId: requiredAt(SEED_ALIGNMENT_FIXTURE_SPAN_IDS, i),
    source: fixture.source as "annotation" | "evaluation" | "custom",
    sourceId,
    simulationId: null,
    issueId: null,
    value: 0.95,
    passed: true,
    feedback: fixture.feedback,
    metadata,
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

const simulationScoreRows = [
  {
    id: SEED_SCORE_WARRANTY_SIMULATION_ACTIVE_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    sessionId: null,
    traceId: requiredAt(SEED_WARRANTY_SIMULATION_TRACE_IDS, 0),
    spanId: requiredAt(SEED_WARRANTY_SIMULATION_SPAN_IDS, 0),
    source: "evaluation" as const,
    sourceId: SEED_EVALUATION_ID,
    simulationId: SEED_WARRANTY_SIMULATION_ID,
    issueId: null,
    value: 0.97,
    passed: true,
    feedback: "The active warranty monitor passed the seeded regression scenario set.",
    metadata: { evaluationHash: SEED_WARRANTY_EVALUATION_HASH },
    error: null,
    errored: false,
    duration: 920_000_000,
    tokens: 2_140,
    cost: 312_000,
    draftedAt: null,
    createdAt: createdAtFromDaysAgo(6, 9, 6),
    updatedAt: createdAtFromDaysAgo(6, 9, 6),
  },
  {
    id: SEED_SCORE_WARRANTY_SIMULATION_ARCHIVED_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    sessionId: null,
    traceId: requiredAt(SEED_WARRANTY_SIMULATION_TRACE_IDS, 1),
    spanId: requiredAt(SEED_WARRANTY_SIMULATION_SPAN_IDS, 1),
    source: "evaluation" as const,
    sourceId: SEED_EVALUATION_ARCHIVED_ID,
    simulationId: SEED_WARRANTY_SIMULATION_ID,
    issueId: null,
    value: 0.92,
    passed: true,
    feedback: "The archived terrain-specific monitor still passes the warranty regression set.",
    metadata: { evaluationHash: SEED_WARRANTY_ARCHIVED_EVALUATION_HASH },
    error: null,
    errored: false,
    duration: 880_000_000,
    tokens: 1_960,
    cost: 287_000,
    draftedAt: null,
    createdAt: createdAtFromDaysAgo(6, 9, 7),
    updatedAt: createdAtFromDaysAgo(6, 9, 7),
  },
  {
    id: SEED_SCORE_COMBINATION_SIMULATION_ID,
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    sessionId: null,
    traceId: requiredAt(SEED_COMBINATION_SIMULATION_TRACE_IDS, 0),
    spanId: requiredAt(SEED_COMBINATION_SIMULATION_SPAN_IDS, 0),
    source: "evaluation" as const,
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    simulationId: SEED_SIMULATION_ID,
    issueId: null,
    value: 0.98,
    passed: true,
    feedback: "The dangerous-combination guardrail monitor passed the seeded simulation run.",
    metadata: { evaluationHash: SEED_COMBINATION_EVALUATION_HASH },
    error: null,
    errored: false,
    duration: 940_000_000,
    tokens: 2_220,
    cost: 325_000,
    draftedAt: null,
    createdAt: createdAtFromDaysAgo(4, 13, 24),
    updatedAt: createdAtFromDaysAgo(4, 13, 24),
  },
] as const

const issueOccurrenceScoreRows = SEED_ADDITIONAL_ISSUE_OCCURRENCES.map((occurrence, i) => {
  const createdAt = createdAtFromDaysAgo(occurrence.daysAgo, occurrence.hour, occurrence.minute)
  const seededSource =
    occurrence.source === "custom"
      ? {
          source: "annotation" as const,
          sourceId: annotationSeedSourceId(occurrence.sourceId),
          metadata: { rawFeedback: occurrence.feedback },
        }
      : {
          source: occurrence.source,
          sourceId: occurrence.sourceId,
          metadata: occurrence.metadata,
        }

  return {
    id: ScoreId(seedScoreId(occurrence.idPrefix, i)),
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    sessionId: null,
    traceId: seedIssueOccurrenceTraceId(i),
    spanId: seedIssueOccurrenceSpanId(i),
    source: seededSource.source,
    sourceId: seededSource.sourceId,
    simulationId: null,
    issueId: occurrence.issueId,
    value: occurrence.value,
    passed: occurrence.passed,
    feedback: occurrence.feedback,
    metadata: seededSource.metadata,
    error: occurrence.error,
    errored: occurrence.errored,
    duration: occurrence.duration,
    tokens: occurrence.tokens,
    cost: occurrence.cost,
    draftedAt: null,
    createdAt,
    updatedAt: createdAt,
  } as const
})

const allScoreRows = [
  ...lifecycleScoreRows,
  ...issue1AnnotationScoreRows,
  ...issue2AnnotationScoreRows,
  ...issue3AnnotationScoreRows,
  ...issueOccurrenceScoreRows,
  ...alignmentFixtureScoreRows,
  ...simulationScoreRows,
]

export const issueLinkedScoreSeedRows = allScoreRows.filter(
  (row): row is (typeof allScoreRows)[number] & { issueId: string } => row.issueId !== null && row.draftedAt === null,
)

const seedScores: Seeder = {
  name: "scores/acme-support-score-graph",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        for (const row of allScoreRows) {
          const { id, ...set } = row
          await ctx.db.insert(scores).values(row).onConflictDoUpdate({
            target: scores.id,
            set,
          })
        }

        console.log(
          `  -> scores: ${allScoreRows.length} total (${lifecycleScoreRows.length} lifecycle, ${
            issue1AnnotationScoreRows.length + issue2AnnotationScoreRows.length + issue3AnnotationScoreRows.length
          } annotations, ${issueOccurrenceScoreRows.length} issue occurrences, ${alignmentFixtureScoreRows.length} alignment, ${simulationScoreRows.length} simulation)`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed scores", cause: error }),
    }).pipe(Effect.asVoid),
}

export const scoreSeeders: readonly Seeder[] = [seedScores]
