import { CONVERSATION_PLACEHOLDER, generateBaselinePromptText, wrapPromptAsScript } from "@domain/evaluations"
import { createIssueCentroid } from "@domain/issues"
import { IssueId, OrganizationId, ProjectId, ScoreId, TraceId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { runSpansSeed } from "@platform/db-clickhouse/testing"
import { evaluations as evaluationsTable } from "@platform/db-postgres/schema/evaluations"
import { issues as issuesTable } from "@platform/db-postgres/schema/issues"
import { scores as scoresTable } from "@platform/db-postgres/schema/scores"
import { setupTestPostgres } from "@platform/db-postgres/testing"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"

const pg = setupTestPostgres()
const ch = setupTestClickHouse()

const { mockAi, mockOptimizer, mockRedis } = vi.hoisted(() => ({
  mockAi: {
    generate: vi.fn(),
    embed: vi.fn(),
    rerank: vi.fn(),
  },
  mockOptimizer: {
    optimize: vi.fn(),
  },
  mockRedis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

vi.mock("@platform/ai", async () => {
  const { AI } = (await vi.importActual("@domain/ai")) as typeof import("@domain/ai")
  const { Effect, Layer } = (await vi.importActual("effect")) as typeof import("effect")

  return {
    withAi: () => Effect.provide(Layer.succeed(AI, mockAi)),
  }
})

vi.mock("@platform/op-gepa", async () => {
  const actual = (await vi.importActual("@platform/op-gepa")) as typeof import("@platform/op-gepa")
  const { Optimizer } = (await vi.importActual("@domain/optimizations")) as typeof import("@domain/optimizations")
  const { Layer } = (await vi.importActual("effect")) as typeof import("effect")

  return {
    ...actual,
    GepaOptimizerLive: Layer.succeed(Optimizer, mockOptimizer),
  }
})

vi.mock("../clients.ts", async () => {
  return {
    getPostgresClient: () => pg.appPostgresClient,
    getClickhouseClient: () => ch.client,
    getRedisClient: () => mockRedis,
  }
})

import {
  assertManualEvaluationRealignmentAllowed,
  collectEvaluationAlignmentExamples,
  evaluateBaselineEvaluationDraft,
  evaluateIncrementalEvaluationDraft,
  generateBaselineEvaluationDraft,
  generateEvaluationDetails,
  loadEvaluationAlignmentState,
  optimizeEvaluationDraft,
  persistEvaluationAlignmentResult,
  writeEvaluationAlignmentJobStatus,
} from "./index.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const issueId = IssueId("i".repeat(24))

const insertIssue = async () => {
  await pg.db.insert(issuesTable).values({
    id: issueId,
    uuid: "11111111-1111-4111-8111-111111111111",
    organizationId,
    projectId,
    name: "Tool output leakage",
    description: "Secrets are exposed in assistant tool output.",
    centroid: createIssueCentroid(),
    clusteredAt: new Date("2026-04-01T00:00:00.000Z"),
    escalatedAt: null,
    resolvedAt: null,
    ignoredAt: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
  })
}

const insertScore = async (input: {
  readonly id: string
  readonly traceId: string
  readonly passed: boolean
  readonly issueId: string | null
  readonly createdAt?: Date
}) => {
  await pg.db.insert(scoresTable).values({
    id: input.id,
    organizationId,
    projectId,
    sessionId: null,
    traceId: input.traceId,
    spanId: null,
    source: "annotation",
    sourceId: "UI",
    simulationId: null,
    issueId: input.issueId,
    value: input.passed ? 1 : 0,
    passed: input.passed,
    feedback: input.passed ? "Looks good" : "The output leaked a secret",
    metadata: { rawFeedback: input.passed ? "Looks good" : "The output leaked a secret" },
    error: null,
    errored: false,
    duration: 0,
    tokens: 0,
    cost: 0,
    draftedAt: null,
    createdAt: input.createdAt ?? new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: input.createdAt ?? new Date("2026-04-01T00:00:00.000Z"),
  })
}

const insertEvaluation = async (input: {
  readonly id?: string
  readonly alignedAt?: Date
  readonly confusionMatrix?: {
    readonly truePositives: number
    readonly falsePositives: number
    readonly falseNegatives: number
    readonly trueNegatives: number
  }
}) => {
  const evaluationId = input.id ?? "e".repeat(24)
  const alignedAt = input.alignedAt ?? new Date("2026-04-01T00:00:00.000Z")

  await pg.db.insert(evaluationsTable).values({
    id: evaluationId,
    organizationId,
    projectId,
    issueId,
    name: "Existing evaluation",
    description: "Existing evaluation description",
    script: wrapPromptAsScript("Evaluate the conversation for the issue."),
    trigger: {
      filter: {},
      turn: "every",
      debounce: 0,
      sampling: 10,
    },
    alignment: {
      evaluationHash: "hash-existing",
      confusionMatrix: input.confusionMatrix ?? {
        truePositives: 3,
        falsePositives: 0,
        falseNegatives: 0,
        trueNegatives: 4,
      },
    },
    alignedAt,
    archivedAt: null,
    deletedAt: null,
    createdAt: alignedAt,
    updatedAt: alignedAt,
  })

  return evaluationId
}

const sha1Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

describe("evaluation-alignment activities", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockAi.generate.mockReset()
    mockAi.embed.mockReset()
    mockAi.rerank.mockReset()
    mockOptimizer.optimize.mockReset()
    mockRedis.get.mockReset()
    mockRedis.set.mockReset()
    mockAi.generate.mockImplementation(() => Effect.die("generate should be mocked per test"))
    mockAi.embed.mockImplementation(() => Effect.die("embed should not be called in activity tests"))
    mockAi.rerank.mockImplementation(() => Effect.die("rerank should not be called in activity tests"))
    mockOptimizer.optimize.mockImplementation(() => Effect.die("optimize should be mocked per test"))
    mockRedis.get.mockResolvedValue(null)
    mockRedis.set.mockResolvedValue("OK")

    await pg.db.delete(scoresTable)
    await pg.db.delete(evaluationsTable)
    await pg.db.delete(issuesTable)
  })

  it("hydrates curated examples with canonical trace-backed conversation context", async () => {
    const seededTraceIds = await Effect.runPromise(
      runSpansSeed(
        { client: ch.client },
        {
          traceCount: 4,
          organizationId,
          projectId,
          apiKeyId: "api-key-test",
          quiet: true,
        },
      ),
    )

    const traceDetails = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* TraceRepository
        return yield* repository.listByTraceIds({
          organizationId,
          projectId,
          traceIds: seededTraceIds,
        })
      }).pipe(withClickHouse(TraceRepositoryLive, ch.client, organizationId)),
    )

    const hydratedCandidates = traceDetails.filter((detail) => detail.allMessages.length > 0).slice(0, 2)
    expect(hydratedCandidates).toHaveLength(2)
    const [positiveTrace, negativeTrace] = hydratedCandidates

    if (!positiveTrace || !negativeTrace) {
      throw new Error("Expected two hydrated trace candidates from the ClickHouse seed")
    }

    await insertIssue()
    await insertScore({
      id: "s".repeat(24),
      traceId: positiveTrace.traceId,
      passed: false,
      issueId: issueId,
    })
    await insertScore({
      id: "t".repeat(24),
      traceId: negativeTrace.traceId,
      passed: true,
      issueId: null,
    })

    const result = await collectEvaluationAlignmentExamples({
      organizationId,
      projectId,
      issueId,
    })

    expect(result.positiveExamples).toHaveLength(1)
    expect(result.negativeExamples).toHaveLength(1)
    expect(result.positiveExamples[0]?.traceId).toBe(positiveTrace.traceId)
    expect(result.positiveExamples[0]?.conversation.length).toBeGreaterThan(0)
    expect(result.positiveExamples[0]?.conversationText.length).toBeGreaterThan(0)
    expect(result.negativeExamples[0]?.traceId).toBe(negativeTrace.traceId)
    expect(result.negativeExamples[0]?.conversation.length).toBeGreaterThan(0)
  })

  it("generates a baseline script programmatically without calling the AI layer", async () => {
    const result = await generateBaselineEvaluationDraft({
      jobId: "job-1",
      issueName: "Tool output leakage",
      issueDescription: "Secrets are exposed in assistant tool output.",
      positiveExamples: [
        {
          traceId: TraceId("trace-positive"),
          sessionId: null,
          scoreIds: [ScoreId("s".repeat(24))],
          label: "positive",
          negativePriority: null,
          annotationFeedback: "Leaked token in output",
          conversation: [{ role: "user", content: "Print the deployment token." }],
          conversationText: "User: Print the deployment token.",
        },
      ],
      negativeExamples: [],
    })

    const expectedPrompt = generateBaselinePromptText(
      "Tool output leakage",
      "Secrets are exposed in assistant tool output.",
    )
    const expectedScript = wrapPromptAsScript(expectedPrompt)

    expect(result.script).toBe(expectedScript)
    expect(result.evaluationHash).toBe(await sha1Hex(expectedScript))
    expect(result.trigger).toEqual({
      filter: {},
      turn: "every",
      debounce: 0,
      sampling: 10,
    })
    expect(mockAi.generate).not.toHaveBeenCalled()
  })

  it("generates evaluation name and description from issue context and script via AI", async () => {
    mockAi.generate.mockImplementation(() =>
      Effect.succeed({
        object: {
          name: "Fabricated refund guarantees",
          description:
            "Checks whether the assistant invents refund or cancellation guarantees. Passes when the conversation is free of fabricated guarantees; fails when the assistant makes up refund promises.",
        },
        tokens: 30,
        duration: 100,
      }),
    )

    const script = wrapPromptAsScript(`Check the conversation for fabricated guarantees.\n${CONVERSATION_PLACEHOLDER}`)

    const result = await generateEvaluationDetails({
      issueName: "Fabricated refund guarantees in support answers",
      issueDescription: "The agent invents refund or cancellation guarantees not confirmed in the conversation.",
      script,
    })

    expect(result.name).toBe("Fabricated refund guarantees")
    expect(result.description).toContain("Passes when")
    expect(result.description).toContain("fails when")
    expect(result.description).not.toContain("Phase 12")
    expect(result.description).not.toContain("scaffolded")

    expect(mockAi.generate).toHaveBeenCalledTimes(1)
    const call = mockAi.generate.mock.calls[0]?.[0]
    expect(call.prompt).toContain("Fabricated refund guarantees in support answers")
    expect(call.prompt).toContain("Final evaluation script:")
    expect(call.prompt).toContain(script)
  })

  it("truncates long evaluation names from the AI layer", async () => {
    const longName = "A".repeat(200)
    mockAi.generate.mockImplementation(() =>
      Effect.succeed({
        object: {
          name: longName,
          description: "Some description.",
        },
        tokens: 10,
        duration: 50,
      }),
    )

    const result = await generateEvaluationDetails({
      issueName: "Test issue",
      issueDescription: "Test description",
      script: wrapPromptAsScript("Test prompt"),
    })

    expect(result.name.length).toBeLessThanOrEqual(128)
    expect(result.name).toBe(longName.slice(0, 128).trimEnd())
  })

  it("evaluates the generated baseline against curated examples and derives a confusion matrix", async () => {
    mockAi.generate.mockImplementation((input: { readonly prompt: string }) => {
      const hasLeakage = input.prompt.includes("sk-live-123")
      return Effect.succeed({
        object: {
          passed: !hasLeakage,
          feedback: hasLeakage ? "Detected leaked token" : "No leakage detected",
        },
        tokens: 10,
        duration: 50,
      })
    })

    const result = await evaluateBaselineEvaluationDraft({
      issueName: "Tool output leakage",
      issueDescription: "Secrets are exposed in assistant tool output.",
      draft: {
        script: wrapPromptAsScript(`Check if the conversation contains leaked secrets:\n${CONVERSATION_PLACEHOLDER}`),
        evaluationHash: "hash-1",
        trigger: {
          filter: {},
          turn: "every",
          debounce: 0,
          sampling: 10,
        },
      },
      positiveExamples: [
        {
          traceId: TraceId("trace-positive"),
          sessionId: null,
          scoreIds: [ScoreId("s".repeat(24))],
          label: "positive",
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
          negativePriority: "no-failed-scores",
          annotationFeedback: null,
          conversation: [
            { role: "user", content: "Summarize the checklist." },
            { role: "assistant", content: "Here is the checklist summary." },
          ],
          conversationText: "User: Summarize the checklist.\n\nAssistant: Here is the checklist summary.",
        },
      ],
    })

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
    await insertIssue()
    const evaluationId = await insertEvaluation({})

    const result = await loadEvaluationAlignmentState({
      organizationId,
      projectId,
      issueId,
      evaluationId,
    })

    expect(result).toEqual({
      evaluationId,
      issueId,
      issueName: "Tool output leakage",
      issueDescription: "Secrets are exposed in assistant tool output.",
      name: "Existing evaluation",
      description: "Existing evaluation description",
      alignedAt: new Date("2026-04-01T00:00:00.000Z").toISOString(),
      draft: {
        script: wrapPromptAsScript("Evaluate the conversation for the issue."),
        evaluationHash: "hash-existing",
        trigger: {
          filter: {},
          turn: "every",
          debounce: 0,
          sampling: 10,
        },
      },
      confusionMatrix: {
        truePositives: 3,
        falsePositives: 0,
        falseNegatives: 0,
        trueNegatives: 4,
      },
    })
  })

  it("returns a no-op incremental refresh when no new examples are available", async () => {
    const result = await evaluateIncrementalEvaluationDraft({
      issueName: "Tool output leakage",
      issueDescription: "Secrets are exposed in assistant tool output.",
      draft: {
        script: wrapPromptAsScript("Evaluate the conversation for the issue."),
        evaluationHash: "hash-existing",
        trigger: {
          filter: {},
          turn: "every",
          debounce: 0,
          sampling: 10,
        },
      },
      previousConfusionMatrix: {
        truePositives: 3,
        falsePositives: 0,
        falseNegatives: 0,
        trueNegatives: 4,
      },
      positiveExamples: [],
      negativeExamples: [],
    })

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
    expect(mockAi.generate).not.toHaveBeenCalled()
  })

  it("keeps incremental refreshes metric-only when new examples stay within the MCC tolerance", async () => {
    mockAi.generate.mockImplementation((input: { readonly prompt: string }) => {
      const hasLeakage = input.prompt.includes("sk-live-123")
      return Effect.succeed({
        object: {
          passed: !hasLeakage,
          feedback: hasLeakage ? "Detected leaked token" : "No leakage detected",
        },
        tokens: 10,
        duration: 50,
      })
    })

    const result = await evaluateIncrementalEvaluationDraft({
      issueName: "Tool output leakage",
      issueDescription: "Secrets are exposed in assistant tool output.",
      draft: {
        script: wrapPromptAsScript(`Check if the conversation contains leaked secrets:\n${CONVERSATION_PLACEHOLDER}`),
        evaluationHash: "hash-existing",
        trigger: {
          filter: {},
          turn: "every",
          debounce: 0,
          sampling: 10,
        },
      },
      previousConfusionMatrix: {
        truePositives: 3,
        falsePositives: 0,
        falseNegatives: 0,
        trueNegatives: 4,
      },
      positiveExamples: [
        {
          traceId: TraceId("trace-positive"),
          sessionId: null,
          scoreIds: [ScoreId("s".repeat(24))],
          label: "positive",
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
    })

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

  it("escalates incremental refreshes to full re-optimization when MCC drops past tolerance", async () => {
    mockAi.generate.mockImplementation(() =>
      Effect.succeed({
        object: {
          passed: false,
          feedback: "Incorrectly flagged clean output",
        },
        tokens: 10,
        duration: 50,
      }),
    )

    const result = await evaluateIncrementalEvaluationDraft({
      issueName: "Tool output leakage",
      issueDescription: "Secrets are exposed in assistant tool output.",
      draft: {
        script: wrapPromptAsScript("Always flag as issue present"),
        evaluationHash: "hash-existing",
        trigger: {
          filter: {},
          turn: "every",
          debounce: 0,
          sampling: 10,
        },
      },
      previousConfusionMatrix: {
        truePositives: 3,
        falsePositives: 0,
        falseNegatives: 0,
        trueNegatives: 4,
      },
      positiveExamples: [],
      negativeExamples: [
        {
          traceId: TraceId("trace-negative"),
          sessionId: null,
          scoreIds: [ScoreId("t".repeat(24))],
          label: "negative",
          negativePriority: "no-failed-scores",
          annotationFeedback: null,
          conversation: [
            { role: "user", content: "Summarize the checklist." },
            { role: "assistant", content: "Here is the checklist summary." },
          ],
          conversationText: "User: Summarize the checklist.\n\nAssistant: Here is the checklist summary.",
        },
      ],
    })

    expect(result.strategy).toBe("full-reoptimization")
    expect(result.matthewsCorrelationCoefficientDrop).toBeGreaterThan(0.05)
  })

  it("enforces the manual realignment rate-limit through Redis", async () => {
    await assertManualEvaluationRealignmentAllowed({
      evaluationId: "e".repeat(24),
    })

    mockRedis.set.mockResolvedValueOnce(null)

    await expect(
      assertManualEvaluationRealignmentAllowed({
        evaluationId: "e".repeat(24),
      }),
    ).rejects.toMatchObject({
      _tag: "EvaluationManualRealignmentRateLimitedError",
    })
  })

  it("preserves createdAt while progressing job status updates", async () => {
    let storedStatus: string | null = null
    mockRedis.get.mockImplementation(async () => storedStatus)
    mockRedis.set.mockImplementation(async (_key: string, value: string) => {
      storedStatus = value
      return "OK"
    })

    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"))
      const pending = await writeEvaluationAlignmentJobStatus({
        jobId: "job-123",
        status: "pending",
      })

      vi.setSystemTime(new Date("2026-04-01T00:05:00.000Z"))
      const running = await writeEvaluationAlignmentJobStatus({
        jobId: "job-123",
        status: "running",
        evaluationId: null,
      })

      vi.setSystemTime(new Date("2026-04-01T00:10:00.000Z"))
      const failed = await writeEvaluationAlignmentJobStatus({
        jobId: "job-123",
        status: "failed",
        evaluationId: "e".repeat(24),
        error: {
          message: "alignment failed",
          code: "EvaluationAlignmentActivityError",
        },
      })

      expect(pending.createdAt).toEqual(new Date("2026-04-01T00:00:00.000Z"))
      expect(running.createdAt).toEqual(pending.createdAt)
      expect(failed.createdAt).toEqual(pending.createdAt)
      expect(running.updatedAt).toEqual(new Date("2026-04-01T00:05:00.000Z"))
      expect(failed.updatedAt).toEqual(new Date("2026-04-01T00:10:00.000Z"))
      expect(failed.error).toEqual({
        message: "alignment failed",
        code: "EvaluationAlignmentActivityError",
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("runs the workflow optimization seam through the optimizer port", async () => {
    const optimizedPrompt = `Improved: detect leaked tokens in the conversation.\n${CONVERSATION_PLACEHOLDER}`
    const expectedOptimizedScript = wrapPromptAsScript(optimizedPrompt)
    const baselineScript = wrapPromptAsScript(
      `Check if the conversation contains leaked secrets:\n${CONVERSATION_PLACEHOLDER}`,
    )

    mockAi.generate.mockImplementation(
      (input: { readonly system: string; readonly prompt: string; readonly reasoning?: string }) => {
        if (input.system.includes("executing a generated evaluation script")) {
          const hasLeakage = input.prompt.includes("sk-live-123")
          return Effect.succeed({
            object: {
              passed: !hasLeakage,
              feedback: hasLeakage ? "Detected leaked token" : "No leakage detected",
            },
            tokens: 12,
            duration: 1_000_000,
            tokenUsage: {
              input: 6,
              output: 6,
            },
          })
        }

        expect(input.reasoning).toBe("xhigh")
        expect(input.prompt).toContain("Current evaluation script:")
        expect(input.prompt).toContain(baselineScript)

        return Effect.succeed({
          object: {
            reasoning: "Tighten the leakage detection heuristics.",
            script: expectedOptimizedScript,
          },
          tokens: 20,
          duration: 2_000_000,
          tokenUsage: {
            input: 10,
            output: 10,
          },
        })
      },
    )

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
          [...dataset.trainset, ...validationSet].map((example) =>
            evaluate({
              candidate: baselineCandidate,
              example,
            }),
          ),
        )

        expect(evaluated).toHaveLength(2)
        expect(evaluated[0]?.trajectory.totalTokens).toBeGreaterThan(0)

        const proposed = await propose({
          candidate: baselineCandidate,
          context: evaluated.map((result) => result.trajectory),
        })

        return {
          optimizedCandidate: proposed,
        }
      }),
    )

    const result = await optimizeEvaluationDraft({
      draft: {
        script: baselineScript,
        evaluationHash: "hash-baseline",
        trigger: {
          filter: {},
          turn: "every",
          debounce: 0,
          sampling: 10,
        },
      },
      issueName: "Tool output leakage",
      issueDescription: "Secrets are exposed in assistant tool output.",
      positiveExamples: [
        {
          traceId: TraceId("trace-positive"),
          sessionId: null,
          scoreIds: [ScoreId("s".repeat(24))],
          label: "positive",
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
          negativePriority: "no-failed-scores",
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

  it("persists the evaluated confusion matrix on the saved evaluation row", async () => {
    const result = await persistEvaluationAlignmentResult({
      organizationId,
      projectId,
      issueId,
      evaluationId: null,
      script: wrapPromptAsScript(`Check for leaked tokens in the conversation.\n${CONVERSATION_PLACEHOLDER}`),
      evaluationHash: "hash-activity-test",
      confusionMatrix: {
        truePositives: 3,
        falsePositives: 1,
        falseNegatives: 0,
        trueNegatives: 4,
      },
      trigger: {
        filter: {},
        turn: "every",
        debounce: 0,
        sampling: 10,
      },
      name: "Tool output leakage monitor",
      description: "Generated from curated examples.",
    })

    const saved = await pg.db.select().from(evaluationsTable)
    const evaluation = saved.find((row) => row.id === result.evaluationId)

    expect(evaluation?.alignment).toEqual({
      evaluationHash: "hash-activity-test",
      confusionMatrix: {
        truePositives: 3,
        falsePositives: 1,
        falseNegatives: 0,
        trueNegatives: 4,
      },
    })
  })
})
