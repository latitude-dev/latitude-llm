import { createFakeAI } from "@domain/ai/testing"
import { minimalScriptSession, ScriptRuntimeError } from "@domain/sandbox"
import { createFakeScriptRuntime } from "@domain/sandbox/testing"
import { MessageEmbeddingRepository, TraceSearchRepository } from "@domain/spans"
import { createFakeMessageEmbeddingRepository, createFakeTraceSearchRepository } from "@domain/spans/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { EVALUATION_CONVERSATION_PLACEHOLDER, wrapPromptAsEvaluationScript } from "./codegen/judge-script-template.ts"
import type { LiveEvaluationExecutionError } from "./errors.ts"
import {
  executeLiveEvaluationUseCase,
  liveEvaluationExecutionInputSchema,
  liveEvaluationExecutionResultSchema,
} from "./use-cases/live/execute-live-evaluation.ts"

const evaluationId = "eeeeeeeeeeeeeeeeeeeeeeee"

const session = minimalScriptSession([
  { role: "user", content: "Please summarize the deployment checklist." },
  { role: "assistant", content: "Verify migrations, rollback steps, and dashboards after deploy." },
])

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
  organizationId: "oooooooooooooooooooooooo",
  projectId: "pppppppppppppppppppppppp",
  evaluationId,
  script: validScript,
  session,
})

// The similarity host builder needs these services in context even though these judge/rule scripts
// never call semanticSimilarity(); the fakes are never invoked.
const semanticLayer = Layer.mergeAll(
  Layer.succeed(MessageEmbeddingRepository, createFakeMessageEmbeddingRepository().repository),
  Layer.succeed(TraceSearchRepository, createFakeTraceSearchRepository().repository),
)

describe("executeLiveEvaluationUseCase", () => {
  it("validates the canonical live execution input shape", () => {
    expect(liveEvaluationExecutionInputSchema.safeParse(validInput).success).toBe(true)

    expect(
      liveEvaluationExecutionInputSchema.safeParse({
        ...validInput,
        script: "",
      }).success,
    ).toBe(false)

    expect(
      liveEvaluationExecutionInputSchema.safeParse({
        ...validInput,
        session: "not-a-session",
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

  it("runs the stored script through the sandbox runtime and derives passed from the threshold", async () => {
    const { layer: aiLayer, calls: aiCalls } = createFakeAI()
    const fakeRuntime = createFakeScriptRuntime({
      run: () => Effect.succeed({ value: 0.2, feedback: "exhibits the issue", duration: 5_000, tokens: 12, cost: 3 }),
    })

    const result = await Effect.runPromise(
      executeLiveEvaluationUseCase({
        ...validInput,
        // A deterministic (non-template) script — only executable by the sandbox runtime.
        script: "return Failed(0.2, 'exhibits the issue')",
      }).pipe(Effect.provide(Layer.mergeAll(aiLayer, fakeRuntime.layer, semanticLayer))),
    )

    expect(result).toEqual(
      liveEvaluationExecutionResultSchema.parse({
        result: { passed: false, value: 0.2, feedback: "exhibits the issue" },
        duration: 5_000,
        tokens: 12,
        cost: 3,
      }),
    )
    expect(fakeRuntime.calls.compile).toHaveLength(1)
    expect(fakeRuntime.calls.run).toHaveLength(1)
    expect(fakeRuntime.calls.run[0]?.context.session.conversation[0]?.role).toBe("user")
    expect(aiCalls.generate).toHaveLength(0)
  })

  it("maps sandbox runtime failures to LiveEvaluationExecutionError", async () => {
    const { layer: aiLayer } = createFakeAI()
    const fakeRuntime = createFakeScriptRuntime({
      run: () => Effect.fail(new ScriptRuntimeError({ message: "detector blew up" })),
    })

    await expect(
      Effect.runPromise(
        executeLiveEvaluationUseCase({
          ...validInput,
        }).pipe(Effect.provide(Layer.mergeAll(aiLayer, fakeRuntime.layer, semanticLayer))),
      ),
    ).rejects.toMatchObject({
      _tag: "LiveEvaluationExecutionError",
      evaluationId,
      message: "detector blew up",
    } satisfies Partial<LiveEvaluationExecutionError>)
  })
})
