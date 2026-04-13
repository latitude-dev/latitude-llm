import { AIError, type GenerateInput, type GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  EVALUATION_CONVERSATION_PLACEHOLDER,
  EVALUATION_SCRIPT_RUNTIME_MODEL,
  EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
  type EvaluationScriptExecution,
  estimateEvaluationScriptCostMicrocents,
  wrapPromptAsEvaluationScript,
} from "./runtime/evaluation-execution.ts"
import type { LiveEvaluationExecutionError } from "./errors.ts"
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
    EVALUATION_CONVERSATION_PLACEHOLDER,
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

type AIGenerate = <T>(input: GenerateInput<T>) => Effect.Effect<GenerateResult<T>, AIError>

const createSuccessfulGenerate =
  (result: Omit<EvaluationScriptExecution, "totalCostMicrocents">): AIGenerate =>
  <T>(input: GenerateInput<T>) =>
    Effect.succeed({
      object: input.schema.parse(result.result),
      tokens: result.totalTokens,
      duration: result.totalDurationNs,
      tokenUsage: {
        input: 40,
        output: result.totalTokens - 40,
      },
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

  it("executes the MVP script bridge through the shared AI service", async () => {
    const execution = {
      result: {
        passed: true,
        value: 1,
        feedback: "The conversation does not exhibit the issue.",
      },
      totalTokens: 120,
      totalDurationNs: 456_000_000,
    } as const
    const { layer, calls } = createFakeAI({
      generate: createSuccessfulGenerate(execution),
    })

    const result = await Effect.runPromise(
      executeLiveEvaluationUseCase({
        ...validInput,
      }).pipe(Effect.provide(layer)),
    )

    expect(result).toEqual(
      liveEvaluationExecutionResultSchema.parse({
        result: execution.result,
        duration: execution.totalDurationNs,
        tokens: execution.totalTokens,
        cost: estimateEvaluationScriptCostMicrocents({
          tokens: execution.totalTokens,
          tokenUsage: {
            input: 40,
            output: execution.totalTokens - 40,
          },
        }),
      }),
    )
    expect(calls.generate).toHaveLength(1)
    expect(calls.generate[0]?.provider).toBe(EVALUATION_SCRIPT_RUNTIME_MODEL.provider)
    expect(calls.generate[0]?.model).toBe(EVALUATION_SCRIPT_RUNTIME_MODEL.model)
    expect(calls.generate[0]?.reasoning).toBe(EVALUATION_SCRIPT_RUNTIME_MODEL.reasoning)
    expect(calls.generate[0]?.system).toBe(EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT)
    expect(calls.generate[0]?.prompt).toContain("[user] Please summarize the deployment checklist.")
    expect(calls.generate[0]?.prompt).toContain(
      "[assistant] Verify migrations, rollback steps, and dashboards after deploy.",
    )
  })

  it("fails before AI execution when the stored script is not executable by the MVP runtime", async () => {
    const { layer, calls } = createFakeAI()

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
      message: "Stored evaluation script is not executable by the MVP live evaluation runtime",
    } satisfies Partial<LiveEvaluationExecutionError>)

    expect(calls.generate).toHaveLength(0)
  })

  it("preserves AI failures from the shared AI service", async () => {
    const { layer, calls } = createFakeAI({
      generate: () =>
        Effect.fail(
          new AIError({
            message: "AI generation failed (openai/gpt-5.4): upstream timeout",
          }),
        ),
    })

    await expect(
      Effect.runPromise(
        executeLiveEvaluationUseCase({
          ...validInput,
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(AIError)

    expect(calls.generate).toHaveLength(1)
  })
})
