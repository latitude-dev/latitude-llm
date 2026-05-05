import { createFakeAI } from "@domain/ai/testing"
import type { Evaluation } from "@domain/evaluations"
import {
  collectAlignmentExamplesUseCase,
  defaultEvaluationTrigger,
  EVALUATION_CONVERSATION_PLACEHOLDER,
  type EvaluationAlignmentExample,
  EvaluationAlignmentExamplesRepository,
  type EvaluationAlignmentExamplesRepositoryShape,
  type EvaluationIssue,
  EvaluationIssueRepository,
  EvaluationRepository,
  type EvaluationRepositoryShape,
  emptyEvaluationAlignment,
  evaluateBaselineDraftUseCase,
  evaluateIncrementalDraftUseCase,
  generateBaselineDraftUseCase,
  generateBaselinePromptText,
  loadAlignmentStateUseCase,
  persistAlignmentResultUseCase,
  wrapPromptAsEvaluationScript,
} from "@domain/evaluations"
import {
  ChSqlClient,
  EvaluationId,
  ExternalUserId,
  IssueId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  ScoreId,
  SessionId,
  SimulationId,
  SpanId,
  SqlClient,
  type SqlClientShape,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { createFakeTraceRepository } from "@domain/spans/testing"
import { silenceLoggerInTests } from "@repo/vitest-config/silence-logger"
import { Effect, Layer } from "effect"
import { describe, expect, it, vi } from "vitest"

// FIXME(workflow-runtime): the activity exports in this file are individual
// `(input) => Promise<output>` entry points (Temporal contract). Each one ends
// in `.pipe(Effect.provide(GepaOptimizerLive), ..., withAi(AIGenerateLive, ...))`,
// which bakes the live optimizer and live AI layer into the call site itself.
// Both `Optimizer` and `AI` are properly injectable Context services
// (`@domain/optimizations`, `@domain/ai`) and the use cases yield them
// correctly — only the activity wrapper hardcodes the binding, so we can't
// inject test fakes via `Effect.provide(...)` from the test side.
//
// The right shape: build a shared composition root in `apps/workflows/src/server.ts`
// once at worker startup
//
//   const runtime = ManagedRuntime.make(
//     Layer.mergeAll(GepaOptimizerLive, AIGenerateLive, withTracing, ...),
//   )
//
// pass that `runtime` into each activity, and let activities collapse to:
//
//   export const optimizeEvaluationDraft = (input) =>
//     runtime.runPromise(optimizeUseCase(input))
//
// Tests then build a different runtime from `Layer.mergeAll(fakeOptimizer, fakeAi)`
// and call the same activity shape — no `vi.mock`, no module-graph wrangling.
//
// Doing it for one activity in isolation creates inconsistency with the rest of
// `apps/workflows` and `apps/workers`, so the right unit of work is "extract
// worker runtime composition root" as its own change. Until then we keep these
// two `vi.mock` calls scoped to the only test that exercises the activity body.
const { mockOptimizer, mockAi } = vi.hoisted(() => ({
  mockOptimizer: { optimize: vi.fn() },
  mockAi: { generate: vi.fn(), embed: vi.fn(), rerank: vi.fn() },
}))

vi.mock("@platform/op-gepa", async () => {
  const actual = (await vi.importActual("@platform/op-gepa")) as typeof import("@platform/op-gepa")
  const { Optimizer } = (await vi.importActual("@domain/optimizations")) as typeof import("@domain/optimizations")
  const { Layer } = (await vi.importActual("effect")) as typeof import("effect")

  return {
    ...actual,
    GepaOptimizerLive: Layer.succeed(Optimizer, mockOptimizer),
  }
})

vi.mock("@platform/ai", async () => {
  const { AI } = (await vi.importActual("@domain/ai")) as typeof import("@domain/ai")
  const { Effect, Layer } = (await vi.importActual("effect")) as typeof import("effect")

  return {
    withAi: (_layer?: unknown, _redisClient?: unknown) => Effect.provide(Layer.succeed(AI, mockAi)),
  }
})

import { optimizeEvaluationDraft } from "./index.ts"

silenceLoggerInTests()

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const issueId = IssueId("i".repeat(24))
const evaluationId = EvaluationId("e".repeat(24))

const ISSUE_NAME = "Tool output leakage"
const ISSUE_DESCRIPTION = "Secrets are exposed in assistant tool output."

const inertSqlClient: SqlClientShape = {
  organizationId,
  transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, inertSqlClient)),
  query: () => Effect.die("Repository fakes must not access SqlClient"),
}

const fakeChSqlClient = createFakeChSqlClient({ organizationId })

const sha1Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

const makeIssue = (): EvaluationIssue => ({
  id: issueId,
  projectId: projectId as string,
  name: ISSUE_NAME,
  description: ISSUE_DESCRIPTION,
})

const makeEvaluation = (overrides: Partial<Evaluation> = {}): Evaluation =>
  ({
    id: evaluationId,
    organizationId,
    projectId,
    issueId,
    name: "Existing evaluation",
    description: "Existing evaluation description",
    script: wrapPromptAsEvaluationScript("Evaluate the conversation for the issue."),
    trigger: defaultEvaluationTrigger(),
    alignment: {
      ...emptyEvaluationAlignment("hash-existing"),
      confusionMatrix: { truePositives: 3, falsePositives: 0, falseNegatives: 0, trueNegatives: 4 },
    },
    alignedAt: new Date("2026-04-01T00:00:00.000Z"),
    archivedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides,
  }) as Evaluation

const makeIssueRepoLayer = () =>
  Layer.succeed(EvaluationIssueRepository, {
    findById: (id) =>
      String(id) === String(issueId)
        ? Effect.succeed(makeIssue())
        : Effect.fail(new NotFoundError({ entity: "EvaluationIssue", id: String(id) })),
  })

const makeEvaluationRepoLayer = (overrides?: Partial<EvaluationRepositoryShape>) => {
  const stored = new Map<string, Evaluation>()
  const repo: EvaluationRepositoryShape = {
    findById: (id) => {
      const found = stored.get(id)
      return found ? Effect.succeed(found) : Effect.fail(new NotFoundError({ entity: "Evaluation", id }))
    },
    save: (evaluation) =>
      Effect.sync(() => {
        stored.set(evaluation.id, evaluation)
      }),
    listByProjectId: () => Effect.die("listByProjectId unused"),
    listByIssueId: () => Effect.die("listByIssueId unused"),
    listByIssueIds: () => Effect.die("listByIssueIds unused"),
    archive: () => Effect.die("archive unused"),
    unarchive: () => Effect.die("unarchive unused"),
    softDelete: () => Effect.die("softDelete unused"),
    softDeleteByIssueId: () => Effect.die("softDeleteByIssueId unused"),
    ...overrides,
  }
  return { layer: Layer.succeed(EvaluationRepository, repo), stored }
}

const makeAlignmentExamplesRepoLayer = (overrides: Partial<EvaluationAlignmentExamplesRepositoryShape> = {}) =>
  Layer.succeed(EvaluationAlignmentExamplesRepository, {
    listPositiveExamples: overrides.listPositiveExamples ?? (() => Effect.succeed([])),
    listNegativeExamples: overrides.listNegativeExamples ?? (() => Effect.succeed([])),
  })

const makeTraceDetail = (traceId: string, content: string): TraceDetail => ({
  organizationId,
  projectId,
  traceId: TraceId(traceId.padEnd(32, "0").slice(0, 32)),
  spanCount: 1,
  errorCount: 0,
  startTime: new Date("2026-04-01T00:00:00.000Z"),
  endTime: new Date("2026-04-01T00:00:01.000Z"),
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
  sessionId: SessionId("s".repeat(64)),
  userId: ExternalUserId("u".repeat(24)),
  simulationId: SimulationId(""),
  tags: [],
  metadata: {},
  models: [],
  providers: [],
  serviceNames: [],
  rootSpanId: SpanId("r".repeat(16)),
  rootSpanName: "root",
  systemInstructions: [],
  inputMessages: [],
  outputMessages: [],
  allMessages: [
    { role: "user", parts: [{ type: "text", content }] },
    { role: "assistant", parts: [{ type: "text", content: "Acknowledged." }] },
  ],
})

describe("evaluation-alignment activities", () => {
  it("hydrates curated examples with canonical trace-backed conversation context", async () => {
    const positiveExample: EvaluationAlignmentExample = {
      traceId: TraceId("a".repeat(32)),
      sessionId: null,
      scoreIds: [ScoreId("s".repeat(24))],
      label: "positive",
      positivePriority: "failed-annotation-no-passes",
      negativePriority: null,
      annotationFeedback: "Leaked deployment token",
    }
    const negativeExample: EvaluationAlignmentExample = {
      traceId: TraceId("b".repeat(32)),
      sessionId: null,
      scoreIds: [ScoreId("t".repeat(24))],
      label: "negative",
      positivePriority: null,
      negativePriority: "passed-annotation-no-failures",
      annotationFeedback: null,
    }

    const { repository: traceRepository } = createFakeTraceRepository({
      listByTraceIds: ({ traceIds }) =>
        Effect.succeed(traceIds.map((id) => makeTraceDetail(String(id), "Print the deployment token."))),
    })

    const result = await Effect.runPromise(
      collectAlignmentExamplesUseCase({
        organizationId: String(organizationId),
        projectId: String(projectId),
        issueId: String(issueId),
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            makeIssueRepoLayer(),
            makeAlignmentExamplesRepoLayer({
              listPositiveExamples: () => Effect.succeed([positiveExample]),
              listNegativeExamples: () => Effect.succeed([negativeExample]),
            }),
            Layer.succeed(TraceRepository, traceRepository),
            Layer.succeed(SqlClient, inertSqlClient),
            Layer.succeed(ChSqlClient, fakeChSqlClient),
          ),
        ),
      ),
    )

    expect(result.positiveExamples).toHaveLength(1)
    expect(result.negativeExamples).toHaveLength(1)
    expect(result.positiveExamples[0]?.traceId).toBe(positiveExample.traceId)
    expect(result.positiveExamples[0]?.conversation.length).toBeGreaterThan(0)
    expect(result.positiveExamples[0]?.conversationText.length).toBeGreaterThan(0)
    expect(result.negativeExamples[0]?.traceId).toBe(negativeExample.traceId)
  })

  it("generates a baseline script programmatically without calling the AI layer", async () => {
    const { calls } = createFakeAI()

    const result = await Effect.runPromise(
      generateBaselineDraftUseCase({ issueName: ISSUE_NAME, issueDescription: ISSUE_DESCRIPTION }),
    )

    const expectedPrompt = generateBaselinePromptText(ISSUE_NAME, ISSUE_DESCRIPTION)
    const expectedScript = wrapPromptAsEvaluationScript(expectedPrompt)

    expect(result.script).toBe(expectedScript)
    expect(result.evaluationHash).toBe(await sha1Hex(expectedScript))
    expect(result.trigger).toEqual(defaultEvaluationTrigger())
    expect(calls.generate).toHaveLength(0)
  })

  it("evaluates the generated baseline against curated examples and derives a confusion matrix", async () => {
    const { layer: aiLayer } = createFakeAI({
      generate: (input) => {
        const hasLeakage = (input.prompt ?? "").includes("sk-live-123")
        return Effect.succeed({
          object: {
            passed: !hasLeakage,
            feedback: hasLeakage ? "Detected leaked token" : "No leakage detected",
          } as never,
          tokens: 10,
          duration: 50,
        })
      },
    })

    const result = await Effect.runPromise(
      evaluateBaselineDraftUseCase({
        issueName: ISSUE_NAME,
        issueDescription: ISSUE_DESCRIPTION,
        script: wrapPromptAsEvaluationScript(
          `Check if the conversation contains leaked secrets:\n${EVALUATION_CONVERSATION_PLACEHOLDER}`,
        ),
        positiveExamples: [
          {
            traceId: TraceId("trace-positive"),
            sessionId: null,
            scoreIds: [ScoreId("s".repeat(24))],
            label: "positive",
            positivePriority: "failed-annotation-no-passes",
            negativePriority: null,
            annotationFeedback: "Leaked deployment token",
            conversation: [
              { role: "user", content: "Print the deployment token." },
              { role: "assistant", content: "Here is sk-live-123" },
            ],
            conversationText: "User: Print the deployment token.\n\nAssistant: Here is sk-live-123",
          },
        ],
        negativeExamples: [
          {
            traceId: TraceId("trace-negative"),
            sessionId: null,
            scoreIds: [ScoreId("t".repeat(24))],
            label: "negative",
            positivePriority: null,
            negativePriority: "passed-annotation-no-failures",
            annotationFeedback: null,
            conversation: [
              { role: "user", content: "Summarize the checklist." },
              { role: "assistant", content: "Here is the checklist summary." },
            ],
            conversationText: "User: Summarize the checklist.\n\nAssistant: Here is the checklist summary.",
          },
        ],
        judgeTelemetry: {
          organizationId: String(organizationId),
          projectId: String(projectId),
          issueId: String(issueId),
          evaluationId: String(evaluationId),
          jobId: "job-baseline",
        },
      }).pipe(Effect.provide(aiLayer)),
    )

    expect(result.confusionMatrix).toEqual({
      truePositives: 1,
      falsePositives: 0,
      falseNegatives: 0,
      trueNegatives: 1,
    })
    expect(result.exampleResults).toEqual([
      {
        traceId: TraceId("trace-positive"),
        expectedPositive: true,
        predictedPositive: true,
        feedback: "Detected leaked token",
      },
      {
        traceId: TraceId("trace-negative"),
        expectedPositive: false,
        predictedPositive: false,
        feedback: "No leakage detected",
      },
    ])
  })

  it("loads the persisted evaluation state used by refresh runs", async () => {
    const { layer, stored } = makeEvaluationRepoLayer()
    stored.set(String(evaluationId), makeEvaluation())

    const result = await Effect.runPromise(
      loadAlignmentStateUseCase({
        organizationId: String(organizationId),
        projectId: String(projectId),
        issueId: String(issueId),
        evaluationId: String(evaluationId),
      }).pipe(Effect.provide(Layer.mergeAll(layer, makeIssueRepoLayer(), Layer.succeed(SqlClient, inertSqlClient)))),
    )

    expect(result).toEqual({
      evaluationId: String(evaluationId),
      issueId: String(issueId),
      issueName: ISSUE_NAME,
      issueDescription: ISSUE_DESCRIPTION,
      name: "Existing evaluation",
      description: "Existing evaluation description",
      alignedAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
      draft: {
        script: wrapPromptAsEvaluationScript("Evaluate the conversation for the issue."),
        evaluationHash: "hash-existing",
        trigger: defaultEvaluationTrigger(),
      },
      confusionMatrix: { truePositives: 3, falsePositives: 0, falseNegatives: 0, trueNegatives: 4 },
    })
  })

  it("returns a no-op incremental refresh when no new examples are available", async () => {
    const { layer: aiLayer, calls } = createFakeAI({
      generate: () => Effect.die("AI should not be called when there are no new examples"),
    })

    const result = await Effect.runPromise(
      evaluateIncrementalDraftUseCase({
        issueName: ISSUE_NAME,
        issueDescription: ISSUE_DESCRIPTION,
        draft: {
          script: wrapPromptAsEvaluationScript("Evaluate the conversation for the issue."),
          evaluationHash: "hash-existing",
          trigger: defaultEvaluationTrigger(),
        },
        previousConfusionMatrix: { truePositives: 3, falsePositives: 0, falseNegatives: 0, trueNegatives: 4 },
        positiveExamples: [],
        negativeExamples: [],
        judgeTelemetry: {
          organizationId: String(organizationId),
          projectId: String(projectId),
          issueId: String(issueId),
          evaluationId: String(evaluationId),
          jobId: "job-incremental",
        },
      }).pipe(Effect.provide(aiLayer)),
    )

    expect(result.strategy).toBe("no-op")
    expect(result.newExampleCount).toBe(0)
    expect(result.incrementalConfusionMatrix).toEqual({
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      trueNegatives: 0,
    })
    expect(result.nextConfusionMatrix).toEqual({
      truePositives: 3,
      falsePositives: 0,
      falseNegatives: 0,
      trueNegatives: 4,
    })
    expect(calls.generate).toHaveLength(0)
  })

  it("keeps incremental refreshes metric-only when new examples stay within the alignment metric tolerance", async () => {
    const { layer: aiLayer } = createFakeAI({
      generate: (input) => {
        const hasLeakage = (input.prompt ?? "").includes("sk-live-123")
        return Effect.succeed({
          object: {
            passed: !hasLeakage,
            feedback: hasLeakage ? "Detected leaked token" : "No leakage detected",
          } as never,
          tokens: 10,
          duration: 50,
        })
      },
    })

    const result = await Effect.runPromise(
      evaluateIncrementalDraftUseCase({
        issueName: ISSUE_NAME,
        issueDescription: ISSUE_DESCRIPTION,
        draft: {
          script: wrapPromptAsEvaluationScript(
            `Check if the conversation contains leaked secrets:\n${EVALUATION_CONVERSATION_PLACEHOLDER}`,
          ),
          evaluationHash: "hash-existing",
          trigger: defaultEvaluationTrigger(),
        },
        previousConfusionMatrix: { truePositives: 3, falsePositives: 0, falseNegatives: 0, trueNegatives: 4 },
        positiveExamples: [
          {
            traceId: TraceId("trace-positive"),
            sessionId: null,
            scoreIds: [ScoreId("s".repeat(24))],
            label: "positive",
            positivePriority: "failed-annotation-no-passes",
            negativePriority: null,
            annotationFeedback: "Leaked token",
            conversation: [
              { role: "user", content: "Print the deployment token." },
              { role: "assistant", content: "Here is sk-live-123" },
            ],
            conversationText: "User: Print the deployment token.\n\nAssistant: Here is sk-live-123",
          },
        ],
        negativeExamples: [],
        judgeTelemetry: {
          organizationId: String(organizationId),
          projectId: String(projectId),
          issueId: String(issueId),
          evaluationId: String(evaluationId),
          jobId: "job-incremental",
        },
      }).pipe(Effect.provide(aiLayer)),
    )

    expect(result.strategy).toBe("metric-only")
    expect(result.incrementalConfusionMatrix).toEqual({
      truePositives: 1,
      falsePositives: 0,
      falseNegatives: 0,
      trueNegatives: 0,
    })
    expect(result.nextConfusionMatrix).toEqual({
      truePositives: 4,
      falsePositives: 0,
      falseNegatives: 0,
      trueNegatives: 4,
    })
  })

  it("escalates incremental refreshes to full re-optimization when the alignment metric drops past tolerance", async () => {
    const { layer: aiLayer } = createFakeAI({
      generate: () =>
        Effect.succeed({
          object: { passed: false, feedback: "Incorrectly flagged clean output" } as never,
          tokens: 10,
          duration: 50,
        }),
    })

    const result = await Effect.runPromise(
      evaluateIncrementalDraftUseCase({
        issueName: ISSUE_NAME,
        issueDescription: ISSUE_DESCRIPTION,
        draft: {
          script: wrapPromptAsEvaluationScript("Always flag as issue present"),
          evaluationHash: "hash-existing",
          trigger: defaultEvaluationTrigger(),
        },
        previousConfusionMatrix: { truePositives: 3, falsePositives: 0, falseNegatives: 0, trueNegatives: 4 },
        positiveExamples: [],
        negativeExamples: [
          {
            traceId: TraceId("trace-negative"),
            sessionId: null,
            scoreIds: [ScoreId("t".repeat(24))],
            label: "negative",
            positivePriority: null,
            negativePriority: "passed-annotation-no-failures",
            annotationFeedback: null,
            conversation: [
              { role: "user", content: "Summarize the checklist." },
              { role: "assistant", content: "Here is the checklist summary." },
            ],
            conversationText: "User: Summarize the checklist.\n\nAssistant: Here is the checklist summary.",
          },
        ],
        judgeTelemetry: {
          organizationId: String(organizationId),
          projectId: String(projectId),
          issueId: String(issueId),
          evaluationId: String(evaluationId),
          jobId: "job-incremental",
        },
      }).pipe(Effect.provide(aiLayer)),
    )

    expect(result.strategy).toBe("full-reoptimization")
    expect(result.alignmentMetricDrop).toBeGreaterThan(0.05)
  })

  it("runs the workflow optimization seam through the optimizer port", async () => {
    const optimizedPrompt = `Improved: detect leaked tokens in the conversation.\n${EVALUATION_CONVERSATION_PLACEHOLDER}`
    const expectedOptimizedScript = wrapPromptAsEvaluationScript(optimizedPrompt)
    const baselineScript = wrapPromptAsEvaluationScript(
      `Check if the conversation contains leaked secrets:\n${EVALUATION_CONVERSATION_PLACEHOLDER}`,
    )

    mockAi.generate.mockReset()
    mockAi.generate.mockImplementation(
      (input: { readonly system?: string; readonly prompt?: string; readonly reasoning?: string }) => {
        if ((input.system ?? "").includes("executing a generated evaluation script")) {
          const hasLeakage = (input.prompt ?? "").includes("sk-live-123")
          return Effect.succeed({
            object: {
              passed: !hasLeakage,
              feedback: hasLeakage ? "Detected leaked token" : "No leakage detected",
            } as never,
            tokens: 12,
            duration: 1_000_000,
            tokenUsage: { input: 6, output: 6 },
          })
        }

        expect(input.reasoning).toBe("high")
        expect(input.prompt).toContain("Current evaluation script:")
        expect(input.prompt).toContain(baselineScript)

        return Effect.succeed({
          object: {
            reasoning: "Tighten the leakage detection heuristics.",
            script: expectedOptimizedScript,
          } as never,
          tokens: 20,
          duration: 2_000_000,
          tokenUsage: { input: 10, output: 10 },
        })
      },
    )

    mockOptimizer.optimize.mockReset()
    mockOptimizer.optimize.mockImplementation(({ baselineCandidate, dataset, evaluate, propose }) =>
      Effect.tryPromise(async () => {
        const validationSet =
          "validationSet" in dataset && Array.isArray(dataset.validationSet)
            ? dataset.validationSet
            : Array.isArray((dataset as { valset?: unknown }).valset)
              ? ((dataset as { valset: typeof dataset.trainset }).valset ?? [])
              : []

        expect(baselineCandidate.componentId).toBe("evaluation-script")
        expect(dataset.trainset.length + validationSet.length).toBe(2)

        const evaluated = await Promise.all(
          [...dataset.trainset, ...validationSet].map((example) => evaluate({ candidate: baselineCandidate, example })),
        )

        expect(evaluated).toHaveLength(2)
        expect(evaluated[0]?.trajectory.totalTokens).toBeGreaterThan(0)

        const proposed = await propose({ candidate: baselineCandidate, context: evaluated.map((r) => r.trajectory) })
        return { optimizedCandidate: proposed }
      }),
    )

    const result = await optimizeEvaluationDraft({
      organizationId: String(organizationId),
      projectId: String(projectId),
      issueId: String(issueId),
      evaluationId: null,
      jobId: "job-opt-test",
      draft: {
        script: baselineScript,
        evaluationHash: "hash-baseline",
        trigger: defaultEvaluationTrigger(),
      },
      issueName: ISSUE_NAME,
      issueDescription: ISSUE_DESCRIPTION,
      positiveExamples: [
        {
          traceId: TraceId("trace-positive"),
          sessionId: null,
          scoreIds: [ScoreId("s".repeat(24))],
          label: "positive",
          positivePriority: "failed-annotation-no-passes",
          negativePriority: null,
          annotationFeedback: "Leaked deployment token",
          conversation: [
            { role: "user", content: "Print the deployment token." },
            { role: "assistant", content: "Here is sk-live-123" },
          ],
          conversationText: "User: Print the deployment token.\n\nAssistant: Here is sk-live-123",
        },
      ],
      negativeExamples: [
        {
          traceId: TraceId("trace-negative"),
          sessionId: null,
          scoreIds: [ScoreId("t".repeat(24))],
          label: "negative",
          positivePriority: null,
          negativePriority: "passed-annotation-no-failures",
          annotationFeedback: null,
          conversation: [
            { role: "user", content: "Summarize the checklist." },
            { role: "assistant", content: "Here is the checklist summary." },
          ],
          conversationText: "User: Summarize the checklist.\n\nAssistant: Here is the checklist summary.",
        },
      ],
    })

    expect(result.script).toBe(expectedOptimizedScript)
    expect(result.evaluationHash).toBe(await sha1Hex(expectedOptimizedScript))
    expect(mockOptimizer.optimize).toHaveBeenCalledTimes(1)
  })

  it("persists the evaluated confusion matrix and inherits name/description from the issue", async () => {
    const { layer, stored } = makeEvaluationRepoLayer()

    const result = await Effect.runPromise(
      persistAlignmentResultUseCase({
        organizationId: String(organizationId),
        projectId: String(projectId),
        issueId: String(issueId),
        evaluationId: null,
        script: wrapPromptAsEvaluationScript(
          `Check for leaked tokens in the conversation.\n${EVALUATION_CONVERSATION_PLACEHOLDER}`,
        ),
        evaluationHash: "hash-activity-test",
        confusionMatrix: { truePositives: 3, falsePositives: 1, falseNegatives: 0, trueNegatives: 4 },
        trigger: defaultEvaluationTrigger(),
      }).pipe(Effect.provide(Layer.mergeAll(layer, makeIssueRepoLayer(), Layer.succeed(SqlClient, inertSqlClient)))),
    )

    const evaluation = stored.get(String(result.evaluationId))
    expect(evaluation?.name).toBe(ISSUE_NAME)
    expect(evaluation?.description).toBe(ISSUE_DESCRIPTION)
    expect(evaluation?.alignment).toEqual({
      evaluationHash: "hash-activity-test",
      confusionMatrix: { truePositives: 3, falsePositives: 1, falseNegatives: 0, trueNegatives: 4 },
    })
  })

  it("overwrites an existing evaluation's name/description with the linked issue's current values", async () => {
    const { layer, stored } = makeEvaluationRepoLayer()
    stored.set(String(evaluationId), makeEvaluation())

    const result = await Effect.runPromise(
      persistAlignmentResultUseCase({
        organizationId: String(organizationId),
        projectId: String(projectId),
        issueId: String(issueId),
        evaluationId: String(evaluationId),
        script: wrapPromptAsEvaluationScript(
          `Check for leaked tokens in the conversation.\n${EVALUATION_CONVERSATION_PLACEHOLDER}`,
        ),
        evaluationHash: "hash-overwrite-test",
        confusionMatrix: { truePositives: 5, falsePositives: 0, falseNegatives: 0, trueNegatives: 5 },
        trigger: defaultEvaluationTrigger(),
      }).pipe(Effect.provide(Layer.mergeAll(layer, makeIssueRepoLayer(), Layer.succeed(SqlClient, inertSqlClient)))),
    )

    const evaluation = stored.get(String(result.evaluationId))
    expect(evaluation?.name).toBe(ISSUE_NAME)
    expect(evaluation?.description).toBe(ISSUE_DESCRIPTION)
    expect(evaluation?.name).not.toBe("Existing evaluation")
    expect(evaluation?.description).not.toBe("Existing evaluation description")
  })
})
