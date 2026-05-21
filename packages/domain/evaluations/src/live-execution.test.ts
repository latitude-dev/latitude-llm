import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { EvaluationExecutionError, type LiveEvaluationExecutionError } from "./errors.ts"
import {
  type EvaluationScriptExecution,
  EvaluationScriptRuntime,
  type ExecuteEvaluationScriptRuntimeInput,
} from "./index.ts"
import {
  EVALUATION_CONVERSATION_PLACEHOLDER,
  EVALUATION_CONVERSATION_TEXT_PLACEHOLDER,
  estimateEvaluationScriptCostMicrocents,
  normalizeLegacyEvaluationScript,
  wrapPromptAsEvaluationScript,
  wrapPromptAsLegacyMvpEvaluationScript,
} from "./runtime/evaluation-execution.ts"
import {
  executeLiveEvaluationUseCase,
  liveEvaluationExecutionInputSchema,
  liveEvaluationExecutionResultSchema,
} from "./use-cases/live/execute-live-evaluation.ts"

const evaluationId = "eeeeeeeeeeeeeeeeeeeeeeee"

const allMessages = [
  {
    role: "user",
    parts: [{ type: "text", content: "Please summarize the deployment checklist." }],
  },
  {
    role: "assistant",
    parts: [{ type: "text", content: "Verify migrations, rollback steps, and dashboards after deploy." }],
  },
] as const

const validScript = wrapPromptAsEvaluationScript(
  [
    "Review the following conversation for the target issue.",
    "",
    "Conversation:",
    EVALUATION_CONVERSATION_TEXT_PLACEHOLDER,
    "",
    "Set passed to true when the issue is absent.",
  ].join("\n"),
)

const validInput = liveEvaluationExecutionInputSchema.parse({
  evaluationId,
  script: validScript,
  issue: {
    name: "Deployment checklist omission",
    description: "The assistant fails to mention key deployment steps.",
  },
  conversation: allMessages,
})

const createRuntimeLayer = (execution: EvaluationScriptExecution, calls: string[] = []) =>
  Layer.succeed(EvaluationScriptRuntime, {
    compile: () => Effect.void,
    execute: (input) =>
      Effect.sync(() => {
        calls.push(input.script)
        return execution
      }),
  })

describe("executeLiveEvaluationUseCase", () => {
  it("validates the canonical live execution input shape", () => {
    expect(liveEvaluationExecutionInputSchema.safeParse(validInput).success).toBe(true)

    expect(
      liveEvaluationExecutionInputSchema.safeParse({
        ...validInput,
        issue: {
          name: "",
          description: validInput.issue.description,
        },
      }).success,
    ).toBe(false)

    expect(
      liveEvaluationExecutionInputSchema.safeParse({
        ...validInput,
        conversation: ["not-a-message"],
      }).success,
    ).toBe(false)
  })

  it("validates the canonical live execution result shape", () => {
    expect(
      liveEvaluationExecutionResultSchema.safeParse({
        result: {
          passed: false,
          value: 0,
          feedback: "The issue is present in the conversation.",
        },
        duration: 456_000_000,
        tokens: 120,
        cost: 6400,
      }).success,
    ).toBe(true)

    expect(
      liveEvaluationExecutionResultSchema.safeParse({
        result: {
          passed: true,
          value: 2,
          feedback: "Out-of-range score",
        },
        duration: 456_000_000,
        tokens: 120,
        cost: 6400,
      }).success,
    ).toBe(false)

    expect(
      liveEvaluationExecutionResultSchema.safeParse({
        result: {
          passed: true,
          value: 1,
          feedback: "Negative accounting fields are invalid",
        },
        duration: -1,
        tokens: -2,
        cost: -3,
      }).success,
    ).toBe(false)
  })

  it("executes through the runtime port", async () => {
    const execution = {
      result: {
        passed: true,
        value: 1,
        feedback: "The conversation does not exhibit the issue.",
      },
      totalTokens: 120,
      totalDurationNs: 456_000_000,
      totalCostMicrocents: estimateEvaluationScriptCostMicrocents({ tokens: 120 }),
    } as const
    const calls: string[] = []

    const result = await Effect.runPromise(
      executeLiveEvaluationUseCase(validInput).pipe(Effect.provide(createRuntimeLayer(execution, calls))),
    )

    expect(result).toEqual(
      liveEvaluationExecutionResultSchema.parse({
        result: execution.result,
        duration: execution.totalDurationNs,
        tokens: execution.totalTokens,
        cost: execution.totalCostMicrocents,
      }),
    )
    expect(calls).toEqual([validScript])
  })

  it("passes trace metadata into runtime execution", async () => {
    const execution = {
      result: {
        passed: true,
        value: 1,
        feedback: "The conversation does not exhibit the issue.",
      },
      totalTokens: 0,
      totalDurationNs: 0,
      totalCostMicrocents: 0,
    } as const
    const metadata = {
      duration: 1_234_000_000,
      usage: {
        input: 120,
        output: 80,
        reasoning: 10,
        cacheRead: 5,
        cacheWrite: 3,
      },
      cost: 75,
      turns: 2,
      traceId: "trace-123",
      sessionId: "session-123",
      spanId: "span-123",
      simulationId: null,
    } as const
    const calls: ExecuteEvaluationScriptRuntimeInput[] = []
    const layer = Layer.succeed(EvaluationScriptRuntime, {
      compile: () => Effect.void,
      execute: (input) =>
        Effect.sync(() => {
          calls.push(input)
          return execution
        }),
    })

    await Effect.runPromise(executeLiveEvaluationUseCase({ ...validInput, metadata }).pipe(Effect.provide(layer)))

    expect(calls[0]?.metadata).toEqual(metadata)
    expect(calls[0]).not.toHaveProperty("conversationText")
  })

  it("normalizes legacy MVP scripts before runtime execution", async () => {
    const legacyScript = wrapPromptAsLegacyMvpEvaluationScript(`Check this: ${EVALUATION_CONVERSATION_PLACEHOLDER}`)
    const normalized = normalizeLegacyEvaluationScript(legacyScript)
    expect(normalized).toContain(EVALUATION_CONVERSATION_TEXT_PLACEHOLDER)
    expect(normalized).not.toContain("z.object")
  })

  it("wraps runtime failures as live evaluation execution errors", async () => {
    const layer = Layer.succeed(EvaluationScriptRuntime, {
      compile: () => Effect.void,
      execute: () =>
        Effect.fail(
          new EvaluationExecutionError({
            message: "sandbox exploded",
          }),
        ),
    })

    await expect(
      Effect.runPromise(
        executeLiveEvaluationUseCase({
          ...validInput,
          script: "const result = 'invalid runtime'",
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toMatchObject({
      _tag: "LiveEvaluationExecutionError",
      evaluationId,
      message: "sandbox exploded",
    } satisfies Partial<LiveEvaluationExecutionError>)
  })
})
