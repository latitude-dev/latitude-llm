import { EvaluationId, IssueId, ScoreId, SimulationId } from "@domain/shared"
import {
  ALL_ANNOTATION_TRACE_DAYS_AGO,
  ALL_ISSUE_1_TRACES,
  ALL_ISSUE_2_TRACES,
  ALL_ISSUE_3_TRACES,
  type AnnotationTrace,
  ISSUE_2_ADDITIONAL_NEGATIVES,
  SEED_ACCESS_EVALUATION_ID,
  SEED_ACCESS_ISSUE_ID,
  SEED_ADDITIONAL_ISSUE_OCCURRENCES,
  SEED_BILLING_ISSUE_ID,
  SEED_COMBINATION_EVALUATION_HASH,
  SEED_COMBINATION_EVALUATION_ID,
  SEED_COMBINATION_ISSUE_ID,
  SEED_EVALUATION_ID,
  SEED_EXTRA_ISSUE_IDS,
  SEED_FLAGGER_ISSUE_ID,
  SEED_GENERATE_ISSUE_ID,
  SEED_INSTALLATION_ISSUE_ID,
  SEED_ISSUE_ID,
  SEED_RETURNS_EVALUATION_ID,
  SEED_RETURNS_ISSUE_ID,
  SEED_WARRANTY_ARCHIVED_EVALUATION_HASH,
  SEED_WARRANTY_EVALUATION_HASH,
  type SeedScope,
} from "@domain/shared/seeding"
import { Effect } from "effect"
import { scores } from "../../schema/scores.ts"
import { type SeedContext, SeedError, type Seeder } from "../types.ts"

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
 * (a static fixture from `@domain/shared/seeding`) back to scope-derived ids so the
 * same fixture data writes the canonical literals under the bootstrap scope and
 * fresh ids under any other scope.
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

/**
 * Build the full set of seeded score rows, parameterized by the per-project
 * `SeedScope`. The bootstrap scope's overrides resolve the fixture keys back to
 * the canonical literal ids, so `pnpm seed` produces a byte-identical database.
 */
function buildAllScoreRows(scope: SeedScope) {
  const orgId = scope.organizationId
  const projectId = scope.projectId
  const createdAtFromDaysAgo = (daysAgo: number, hour: number, minute = 0): Date =>
    scope.dateDaysAgo(daysAgo, hour, minute)
  // The UI-polish annotation rows previously hardcoded `annotatorId:
  // SEED_OWNER_USER_ID`, which only exists on the canonical bootstrap
  // org. Pick from `scope.queueAssigneeUserIds` so demo projects
  // reference users that actually exist on the target org. Bootstrap
  // path keeps the owner verbatim because
  // `bootstrapSeedScope.queueAssigneeUserIds[0] === SEED_OWNER_USER_ID`.
  // biome-ignore lint/style/noNonNullAssertion: queueAssigneeUserIds non-empty by SeedScope contract
  const annotatorUserId = scope.queueAssigneeUserIds[0]!

  const evaluationWarrantyActiveId = EvaluationId(scope.cuid("evaluation:warranty-active"))
  const evaluationWarrantyArchivedId = EvaluationId(scope.cuid("evaluation:warranty-archived"))
  const evaluationCombinationId = EvaluationId(scope.cuid("evaluation:combination"))
  const evaluationReturnsId = EvaluationId(scope.cuid("evaluation:returns"))
  const evaluationAccessId = EvaluationId(scope.cuid("evaluation:access"))

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

  const lifecycleScoreRows = [
    {
      id: ScoreId(scope.cuid("score:passed")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: scope.traceHex("lifecycle", 2),
      spanId: scope.spanHex("lifecycle", 2),
      source: "evaluation" as const,
      sourceId: evaluationWarrantyActiveId,
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
      id: ScoreId(scope.cuid("score:errored")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: scope.traceHex("lifecycle", 3),
      spanId: scope.spanHex("lifecycle", 3),
      source: "evaluation" as const,
      sourceId: evaluationCombinationId,
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
      id: ScoreId(scope.cuid("score:draft")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: scope.traceHex("lifecycle", 2),
      spanId: scope.spanHex("lifecycle", 2),
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
      id: ScoreId(scope.cuid("score:api-reviewed")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: scope.traceHex("lifecycle", 3),
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
      id: ScoreId(scope.cuid("score:pending")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: scope.traceHex("lifecycle", 4),
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
        id: ScoreId(scope.cuid(`score:${opts.prefix}:${i}`)),
        organizationId: orgId,
        projectId,
        sessionId: null,
        traceId: scope.traceHex("annotation", opts.offset + i),
        spanId: scope.spanHex("annotation", opts.offset + i),
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
    queueId: queueWarrantyId,
    issueId: issueWarrantyFab,
    prefix: "i1",
    daysAgo: ALL_ANNOTATION_TRACE_DAYS_AGO.slice(0, ALL_ISSUE_1_TRACES.length),
  })

  const issue2AnnotationScoreRows = buildIssueAnnotationScoreRows({
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

  const issue3AnnotationScoreRows = buildIssueAnnotationScoreRows({
    traces: ALL_ISSUE_3_TRACES,
    offset: ALL_ISSUE_1_TRACES.length + ALL_ISSUE_2_TRACES.length,
    queueId: queueLogisticsId,
    issueId: issueLogistics,
    prefix: "i3",
    daysAgo: ALL_ANNOTATION_TRACE_DAYS_AGO.slice(ALL_ISSUE_1_TRACES.length + ALL_ISSUE_2_TRACES.length),
  })

  const alignmentFixtureScoreRows = ISSUE_2_ADDITIONAL_NEGATIVES.map((fixture, i) => {
    const createdAt = createdAtFromDaysAgo(26 - Math.floor(i / 5), 10 + (i % 5))
    const sourceId =
      fixture.source === "annotation"
        ? queueCombinationId
        : fixture.source === "evaluation"
          ? evaluationCombinationId
          : "seed-import"

    const metadata =
      fixture.source === "annotation"
        ? { rawFeedback: fixture.feedback }
        : fixture.source === "evaluation"
          ? { evaluationHash: SEED_COMBINATION_EVALUATION_HASH }
          : { importName: "seed-import", tier: fixture.tier }

    return {
      id: ScoreId(scope.cuid(`score:al:${i}`)),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: scope.traceHex("alignment-fixture", i),
      spanId: scope.spanHex("alignment-fixture", i),
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
      id: ScoreId(scope.cuid("score:warranty-simulation-active")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: scope.traceHex("warranty-simulation", 0),
      spanId: scope.spanHex("warranty-simulation", 0),
      source: "evaluation" as const,
      sourceId: evaluationWarrantyActiveId,
      simulationId: warrantySimulationId,
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
      id: ScoreId(scope.cuid("score:warranty-simulation-archived")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: scope.traceHex("warranty-simulation", 1),
      spanId: scope.spanHex("warranty-simulation", 1),
      source: "evaluation" as const,
      sourceId: evaluationWarrantyArchivedId,
      simulationId: warrantySimulationId,
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
      id: ScoreId(scope.cuid("score:combination-simulation")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: scope.traceHex("combination-simulation", 0),
      spanId: scope.spanHex("combination-simulation", 0),
      source: "evaluation" as const,
      sourceId: evaluationCombinationId,
      simulationId: combinationSimulationId,
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

  const uiPolishAnnotationRows = [
    {
      id: ScoreId(scope.cuid("score:ui-polish:human-draft-1")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: annotationDemoTraceId,
      spanId: annotationDemoSpanId,
      source: "annotation" as const,
      sourceId: "UI",
      simulationId: null,
      issueId: null,
      annotatorId: annotatorUserId,
      value: 0.3,
      passed: false,
      feedback: "Human draft annotation with text range anchor - needs review.",
      metadata: {
        rawFeedback: "Human draft annotation with text range anchor - needs review.",
        messageIndex: 4,
        partIndex: 0,
        startOffset: 10,
        endOffset: 45,
      },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: createdAtFromDaysAgo(1, 10, 5),
      createdAt: createdAtFromDaysAgo(1, 10),
      updatedAt: createdAtFromDaysAgo(1, 10, 5),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:human-draft-2")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: annotationDemoTraceId,
      spanId: annotationDemoSpanId,
      source: "annotation" as const,
      sourceId: "UI",
      simulationId: null,
      issueId: null,
      annotatorId: annotatorUserId,
      value: 0.5,
      passed: false,
      feedback: "Human draft annotation - message level on assistant response.",
      metadata: { rawFeedback: "Human draft annotation - message level on assistant response.", messageIndex: 8 },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: createdAtFromDaysAgo(1, 11, 15),
      createdAt: createdAtFromDaysAgo(1, 11),
      updatedAt: createdAtFromDaysAgo(1, 11, 15),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:human-draft-3")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: annotationDemoTraceId,
      spanId: null,
      source: "annotation" as const,
      sourceId: "UI",
      simulationId: null,
      issueId: null,
      annotatorId: annotatorUserId,
      value: 0.8,
      passed: true,
      feedback: "Human draft annotation - trace level (global).",
      metadata: { rawFeedback: "Human draft annotation - trace level (global)." },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: createdAtFromDaysAgo(1, 12, 30),
      createdAt: createdAtFromDaysAgo(1, 12),
      updatedAt: createdAtFromDaysAgo(1, 12, 30),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:human-published-1")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: annotationDemoTraceId,
      spanId: annotationDemoSpanId,
      source: "annotation" as const,
      sourceId: "UI",
      simulationId: null,
      issueId: null,
      annotatorId: annotatorUserId,
      value: 0.95,
      passed: true,
      feedback: "Human published annotation with text range on tool result.",
      metadata: {
        rawFeedback: "Human published annotation with text range on tool result.",
        messageIndex: 3,
        partIndex: 0,
        startOffset: 0,
        endOffset: 28,
      },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: null,
      createdAt: createdAtFromDaysAgo(5, 9),
      updatedAt: createdAtFromDaysAgo(5, 9),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:human-published-2")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: annotationDemoTraceId,
      spanId: annotationDemoSpanId,
      source: "annotation" as const,
      sourceId: "UI",
      simulationId: null,
      issueId: null,
      annotatorId: annotatorUserId,
      value: 0.1,
      passed: false,
      feedback: "Human published annotation - message level on user message.",
      metadata: { rawFeedback: "Human published annotation - message level on user message.", messageIndex: 5 },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: null,
      createdAt: createdAtFromDaysAgo(6, 14),
      updatedAt: createdAtFromDaysAgo(6, 14),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:human-published-3")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: annotationDemoTraceId,
      spanId: null,
      source: "annotation" as const,
      sourceId: "UI",
      simulationId: null,
      issueId: null,
      annotatorId: annotatorUserId,
      value: 0.88,
      passed: true,
      feedback: "Human published annotation - trace level (global).",
      metadata: { rawFeedback: "Human published annotation - trace level (global)." },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: null,
      createdAt: createdAtFromDaysAgo(7, 11),
      updatedAt: createdAtFromDaysAgo(7, 11),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:agent-draft-1")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: annotationDemoTraceId,
      spanId: annotationDemoSpanId,
      source: "annotation" as const,
      sourceId: queueKitchenSinkId,
      simulationId: null,
      issueId: null,
      annotatorId: null,
      value: 0.25,
      passed: false,
      feedback: "Agent draft annotation with text range anchor on warranty response.",
      metadata: {
        rawFeedback: "Potential warranty fabrication detected. The assistant claims coverage that exceeds policy.",
        messageIndex: 10,
        partIndex: 0,
        startOffset: 50,
        endOffset: 120,
      },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: createdAtFromDaysAgo(0, 8, 30),
      createdAt: createdAtFromDaysAgo(0, 8),
      updatedAt: createdAtFromDaysAgo(0, 8, 30),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:agent-draft-2")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: annotationDemoTraceId,
      spanId: annotationDemoSpanId,
      source: "annotation" as const,
      sourceId: queueKitchenSinkId,
      simulationId: null,
      issueId: null,
      annotatorId: null,
      value: 0.4,
      passed: false,
      feedback: "Agent draft annotation - message level on tool call.",
      metadata: { rawFeedback: "Possible policy violation in response. Review recommended.", messageIndex: 6 },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: createdAtFromDaysAgo(0, 9, 15),
      createdAt: createdAtFromDaysAgo(0, 9),
      updatedAt: createdAtFromDaysAgo(0, 9, 15),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:agent-draft-3")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: annotationDemoTraceId,
      spanId: null,
      source: "annotation" as const,
      sourceId: queueKitchenSinkId,
      simulationId: null,
      issueId: null,
      annotatorId: null,
      value: 0.6,
      passed: true,
      feedback: "Agent draft annotation - trace level (global).",
      metadata: { rawFeedback: "Overall response quality appears satisfactory but requires human confirmation." },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: createdAtFromDaysAgo(0, 10, 45),
      createdAt: createdAtFromDaysAgo(0, 10),
      updatedAt: createdAtFromDaysAgo(0, 10, 45),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:agent-published-1")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: annotationDemoTraceId,
      spanId: annotationDemoSpanId,
      source: "annotation" as const,
      sourceId: queueKitchenSinkId,
      simulationId: null,
      issueId: null,
      annotatorId: null,
      value: 0.92,
      passed: true,
      feedback: "Agent published annotation - message level on assistant response.",
      metadata: { rawFeedback: "Response correctly adheres to warranty policy guidelines.", messageIndex: 12 },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: null,
      createdAt: createdAtFromDaysAgo(3, 15),
      updatedAt: createdAtFromDaysAgo(3, 15),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:agent-published-2")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: annotationDemoTraceId,
      spanId: null,
      source: "annotation" as const,
      sourceId: queueKitchenSinkId,
      simulationId: null,
      issueId: null,
      annotatorId: null,
      value: 0.85,
      passed: true,
      feedback: "Agent published annotation - trace level (global).",
      metadata: { rawFeedback: "No issues found in this conversation. All responses comply with policies." },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: null,
      createdAt: createdAtFromDaysAgo(4, 16),
      updatedAt: createdAtFromDaysAgo(4, 16),
    },
    {
      id: ScoreId(scope.cuid("score:ui-polish:api-published-1")),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: annotationDemoTraceId,
      spanId: annotationDemoSpanId,
      source: "annotation" as const,
      sourceId: "API",
      simulationId: null,
      issueId: null,
      annotatorId: null,
      value: 0.78,
      passed: true,
      feedback: "API published annotation with text range on system message.",
      metadata: {
        rawFeedback: "API published annotation with text range on system message.",
        messageIndex: 0,
        partIndex: 0,
        startOffset: 5,
        endOffset: 50,
      },
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: null,
      createdAt: createdAtFromDaysAgo(2, 13),
      updatedAt: createdAtFromDaysAgo(2, 13),
    },
  ] as const

  // The fixture's `sourceId` is a literal evaluation id when source is
  // "evaluation"; remap it to the corresponding scope-derived evaluation id so
  // the bootstrap scope still writes the literal value while demo scopes get
  // fresh ids consistent with the rest of the project.
  const evaluationLiteralRemap = (literalEvaluationSourceId: string): string => {
    switch (literalEvaluationSourceId) {
      case SEED_EVALUATION_ID:
        return evaluationWarrantyActiveId
      case SEED_COMBINATION_EVALUATION_ID:
        return evaluationCombinationId
      case SEED_RETURNS_EVALUATION_ID:
        return evaluationReturnsId
      case SEED_ACCESS_EVALUATION_ID:
        return evaluationAccessId
      default:
        return literalEvaluationSourceId
    }
  }

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
            sourceId: evaluationLiteralRemap(occurrence.sourceId),
            metadata: occurrence.metadata,
          }

    return {
      id: ScoreId(scope.cuid(`score:${occurrence.idPrefix}:${i}`)),
      organizationId: orgId,
      projectId,
      sessionId: null,
      traceId: scope.traceHex("issue-occurrence", i),
      spanId: scope.spanHex("issue-occurrence", i),
      source: seededSource.source,
      sourceId: seededSource.sourceId,
      simulationId: null,
      issueId: remapFixtureIssueId(occurrence.issueId, scope),
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

  return {
    lifecycleScoreRows,
    issue1AnnotationScoreRows,
    issue2AnnotationScoreRows,
    issue3AnnotationScoreRows,
    issueOccurrenceScoreRows,
    alignmentFixtureScoreRows,
    simulationScoreRows,
    uiPolishAnnotationRows,
    all: [
      ...lifecycleScoreRows,
      ...issue1AnnotationScoreRows,
      ...issue2AnnotationScoreRows,
      ...issue3AnnotationScoreRows,
      ...issueOccurrenceScoreRows,
      ...alignmentFixtureScoreRows,
      ...simulationScoreRows,
      ...uiPolishAnnotationRows,
    ],
  }
}

/**
 * The subset of seeded score rows that are linked to an issue and not in
 * draft state — consumed by the issues seeder to derive issue centroids
 * from feedback embeddings.
 */
export const buildIssueLinkedScoreSeedRows = (scope: SeedScope) =>
  buildAllScoreRows(scope).all.filter(
    (row): row is typeof row & { issueId: string } => row.issueId !== null && row.draftedAt === null,
  )

const seedScores: Seeder = {
  name: "scores/acme-support-score-graph",
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
          `  -> scores: ${allScoreRows.length} total (${built.lifecycleScoreRows.length} lifecycle, ${
            built.issue1AnnotationScoreRows.length +
            built.issue2AnnotationScoreRows.length +
            built.issue3AnnotationScoreRows.length
          } annotations, ${built.issueOccurrenceScoreRows.length} issue occurrences, ${built.alignmentFixtureScoreRows.length} alignment, ${built.simulationScoreRows.length} simulation, ${built.uiPolishAnnotationRows.length} UI polish demo)`,
        )
      },
      catch: (error) => new SeedError({ reason: "Failed to seed scores", cause: error }),
    }).pipe(Effect.asVoid),
}

export const scoreSeeders: readonly Seeder[] = [seedScores]
