import {
  ChSqlClient,
  ExternalUserId,
  IssueId,
  OrganizationId,
  ProjectId,
  ScoreId,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type {
  EvaluationAlignmentExample,
  EvaluationAlignmentExamplesRepositoryShape,
} from "../../ports/evaluation-alignment-examples-repository.ts"
import {
  DEFAULT_ALIGNMENT_EXAMPLE_LIMIT,
  EvaluationAlignmentExamplesRepository,
} from "../../ports/evaluation-alignment-examples-repository.ts"
import { type EvaluationIssue, EvaluationIssueRepository } from "../../ports/evaluation-issue-repository.ts"
import { collectAlignmentExamplesUseCase } from "./collect-alignment-examples.ts"

const ORGANIZATION_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const ISSUE_ID = IssueId("i".repeat(24))

const balancedHalf = Math.floor(DEFAULT_ALIGNMENT_EXAMPLE_LIMIT / 2)

function makeTraceDetail(traceId: TraceId): TraceDetail {
  return {
    organizationId: ORGANIZATION_ID,
    projectId: PROJECT_ID,
    traceId,
    spanCount: 1,
    errorCount: 0,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T00:00:01.000Z"),
    durationNs: 1,
    timeToFirstTokenNs: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 0,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: 0,
    sessionId: SessionId("s".repeat(128)),
    userId: ExternalUserId("u".repeat(24)),
    simulationId: SimulationId(""),
    tags: [],
    metadata: {},
    models: [],
    providers: [],
    serviceNames: [],
    rootSpanId: SpanId("r".repeat(16)),
    rootSpanName: "root",
    systemInstructions: [{ type: "text", text: "" }],
    inputMessages: [],
    outputMessages: [],
    allMessages: [],
  }
}

function makePositiveExample(index: number): EvaluationAlignmentExample {
  const traceId = TraceId(index.toString().padStart(32, "0"))
  return {
    traceId,
    sessionId: null,
    scoreIds: [ScoreId("a".repeat(24))],
    label: "positive",
    positivePriority: "failed-annotation-no-passes",
    negativePriority: null,
    annotationFeedback: null,
  }
}

function makeNegativeExample(index: number): EvaluationAlignmentExample {
  const traceId = TraceId(`n${index.toString().padStart(31, "0")}`)
  return {
    traceId,
    sessionId: null,
    scoreIds: [ScoreId("b".repeat(24))],
    label: "negative",
    positivePriority: null,
    negativePriority: "passed-annotation-no-failures",
    annotationFeedback: null,
  }
}

function runCollect(exampleRepository: EvaluationAlignmentExamplesRepositoryShape) {
  const issue: EvaluationIssue = {
    id: ISSUE_ID,
    projectId: PROJECT_ID as string,
    name: "Issue",
    description: "Desc",
  }

  const { repository: traceRepository } = createFakeTraceRepository({
    listByTraceIds: ({ traceIds }) => Effect.succeed(traceIds.map((traceId) => makeTraceDetail(traceId))),
  })

  return Effect.runPromise(
    collectAlignmentExamplesUseCase({
      organizationId: ORGANIZATION_ID as string,
      projectId: PROJECT_ID as string,
      issueId: ISSUE_ID as string,
      requirePositiveExamples: false,
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(EvaluationIssueRepository, {
            findById: () => Effect.succeed(issue),
          }),
          Layer.succeed(EvaluationAlignmentExamplesRepository, exampleRepository),
          Layer.succeed(TraceRepository, traceRepository),
          Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORGANIZATION_ID })),
          Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: ORGANIZATION_ID })),
        ),
      ),
    ),
  )
}

describe("collectAlignmentExamplesUseCase", () => {
  it("targets a balanced split when both labels have enough examples", async () => {
    const allPositives = Array.from({ length: 300 }, (_, index) => makePositiveExample(index))
    const allNegatives = Array.from({ length: 300 }, (_, index) => makeNegativeExample(index))

    const result = await runCollect({
      listPositiveExamples: ({ limit }) =>
        Effect.succeed(allPositives.slice(0, limit ?? DEFAULT_ALIGNMENT_EXAMPLE_LIMIT)),
      listNegativeExamples: ({ limit, excludeTraceIds }) => {
        const exclude = new Set((excludeTraceIds ?? []).map((id) => id as string))
        const filtered = allNegatives.filter((row) => !exclude.has(row.traceId as string))
        return Effect.succeed(filtered.slice(0, limit ?? DEFAULT_ALIGNMENT_EXAMPLE_LIMIT))
      },
    })

    expect(result.positiveExamples.length).toBe(balancedHalf)
    expect(result.negativeExamples.length).toBe(balancedHalf)
    expect(result.positiveExamples.length + result.negativeExamples.length).toBe(DEFAULT_ALIGNMENT_EXAMPLE_LIMIT)
  })

  it("backfills with negatives when positives are below half of the cap", async () => {
    const allPositives = Array.from({ length: 30 }, (_, index) => makePositiveExample(index))
    const allNegatives = Array.from({ length: 400 }, (_, index) => makeNegativeExample(index))

    const result = await runCollect({
      listPositiveExamples: ({ limit }) =>
        Effect.succeed(allPositives.slice(0, limit ?? DEFAULT_ALIGNMENT_EXAMPLE_LIMIT)),
      listNegativeExamples: ({ limit, excludeTraceIds }) => {
        const exclude = new Set((excludeTraceIds ?? []).map((id) => id as string))
        const filtered = allNegatives.filter((row) => !exclude.has(row.traceId as string))
        return Effect.succeed(filtered.slice(0, limit ?? DEFAULT_ALIGNMENT_EXAMPLE_LIMIT))
      },
    })

    expect(result.positiveExamples.length).toBe(30)
    expect(result.negativeExamples.length).toBe(DEFAULT_ALIGNMENT_EXAMPLE_LIMIT - 30)
  })

  it("backfills with positives when negatives are below half of the cap", async () => {
    const allPositives = Array.from({ length: 400 }, (_, index) => makePositiveExample(index))
    const allNegatives = Array.from({ length: 40 }, (_, index) => makeNegativeExample(index))

    const result = await runCollect({
      listPositiveExamples: ({ limit }) =>
        Effect.succeed(allPositives.slice(0, limit ?? DEFAULT_ALIGNMENT_EXAMPLE_LIMIT)),
      listNegativeExamples: ({ limit, excludeTraceIds }) => {
        const exclude = new Set((excludeTraceIds ?? []).map((id) => id as string))
        const filtered = allNegatives.filter((row) => !exclude.has(row.traceId as string))
        return Effect.succeed(filtered.slice(0, limit ?? DEFAULT_ALIGNMENT_EXAMPLE_LIMIT))
      },
    })

    expect(result.negativeExamples.length).toBe(40)
    expect(result.positiveExamples.length).toBe(DEFAULT_ALIGNMENT_EXAMPLE_LIMIT - 40)
  })
})
