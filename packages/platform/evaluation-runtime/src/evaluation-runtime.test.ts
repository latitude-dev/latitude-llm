import type { AIError, GenerateInput, GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import {
  EVALUATION_SCRIPT_RUNTIME_MODEL,
  EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
  EvaluationScriptRuntime,
} from "@domain/evaluations"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { EvaluationScriptRuntimeLive } from "./index.ts"

const baseInput = {
  script: "return Passed('Looks good')",
  conversation: [{ role: "user", content: "Hello" }],
  metadata: {
    duration: 0,
    usage: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    turns: 1,
  },
  issue: { name: "Test issue", description: "Test description" },
}

type AIGenerate = <T>(input: GenerateInput<T>) => Effect.Effect<GenerateResult<T>, AIError>

const successfulGenerate: AIGenerate = <T>(input: GenerateInput<T>) =>
  Effect.succeed({
    object: input.schema.parse({ passed: true, feedback: "No issue found" }),
    tokens: 12,
    duration: 34,
  })

describe("EvaluationScriptRuntimeLive", () => {
  it("rejects empty scripts at compile time", async () => {
    const { layer } = createFakeAI()

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const runtime = yield* EvaluationScriptRuntime
          return yield* runtime.compile("   ")
        }).pipe(Effect.provide(EvaluationScriptRuntimeLive), Effect.provide(layer)),
      ),
    ).rejects.toMatchObject({ _tag: "EvaluationExecutionError" })
  })

  it("rejects syntax errors at compile time", async () => {
    const { layer } = createFakeAI()

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const runtime = yield* EvaluationScriptRuntime
          return yield* runtime.compile("return Passed('unterminated')}")
        }).pipe(Effect.provide(EvaluationScriptRuntimeLive), Effect.provide(layer)),
      ),
    ).rejects.toMatchObject({ _tag: "EvaluationExecutionError" })
  })

  it("executes simple Passed/Failed scripts", async () => {
    const { layer } = createFakeAI()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* EvaluationScriptRuntime
        return yield* runtime.execute(baseInput)
      }).pipe(Effect.provide(EvaluationScriptRuntimeLive), Effect.provide(layer)),
    )

    expect(result.result).toEqual({ passed: true, value: 1, feedback: "Looks good" })
    expect(result.totalTokens).toBe(0)
  })

  it("executes llm calls through the AI service with JSON Schema", async () => {
    const { layer, calls } = createFakeAI({ generate: successfulGenerate })
    const script = `
const verdictSchema = {
  type: "object",
  additionalProperties: false,
  required: ["passed", "feedback"],
  properties: {
    passed: { type: "boolean" },
    feedback: { type: "string", minLength: 1 },
  },
}
const result = await llm(conversationText, { schema: verdictSchema })
return result.passed ? Passed(result.feedback) : Failed(result.feedback)
`

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* EvaluationScriptRuntime
        return yield* runtime.execute({ ...baseInput, script })
      }).pipe(Effect.provide(EvaluationScriptRuntimeLive), Effect.provide(layer)),
    )

    expect(result.result).toEqual({ passed: true, value: 1, feedback: "No issue found" })
    expect(result.totalTokens).toBe(12)
    expect(result.totalDurationNs).toBe(34)
    expect(calls.generate[0]?.provider).toBe(EVALUATION_SCRIPT_RUNTIME_MODEL.provider)
    expect(calls.generate[0]?.model).toBe(EVALUATION_SCRIPT_RUNTIME_MODEL.model)
    expect(calls.generate[0]?.system).toBe(EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT)
    expect(calls.generate[0]?.prompt).toBe("[user] Hello")
  })

  it("rejects scripts that exceed the llm() call limit", async () => {
    const { layer } = createFakeAI({
      generate: <T>() =>
        Effect.succeed({
          object: "pong" as T,
          tokens: 1,
          duration: 1,
        }),
    })
    const script = `
for (let i = 0; i < 10; i++) {
  await llm("ping", { schema: { type: "string" } })
}
return Passed("done")
`

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const runtime = yield* EvaluationScriptRuntime
          return yield* runtime.execute({ ...baseInput, script })
        }).pipe(Effect.provide(EvaluationScriptRuntimeLive), Effect.provide(layer)),
      ),
    ).rejects.toMatchObject({ _tag: "EvaluationExecutionError" })
  })

  it("validates parse(value, schema) inside the sandbox", async () => {
    const { layer } = createFakeAI()
    const script = `
const parsed = parse({ passed: false, feedback: "Issue present" }, {
  type: "object",
  additionalProperties: false,
  required: ["passed", "feedback"],
  properties: {
    passed: { type: "boolean" },
    feedback: { type: "string", minLength: 1 },
  },
})
return parsed.passed ? Passed(parsed.feedback) : Failed(parsed.feedback)
`

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* EvaluationScriptRuntime
        return yield* runtime.execute({ ...baseInput, script })
      }).pipe(Effect.provide(EvaluationScriptRuntimeLive), Effect.provide(layer)),
    )

    expect(result.result).toEqual({ passed: false, value: 0, feedback: "Issue present" })
  })

  it("blocks process access", async () => {
    const { layer } = createFakeAI()

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const runtime = yield* EvaluationScriptRuntime
          return yield* runtime.execute({ ...baseInput, script: "return Passed(String(typeof process))" })
        }).pipe(Effect.provide(EvaluationScriptRuntimeLive), Effect.provide(layer)),
      ),
    ).resolves.toMatchObject({ result: { feedback: "undefined" } })
  })

  it("terminates infinite loops", async () => {
    const { layer } = createFakeAI()

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const runtime = yield* EvaluationScriptRuntime
          return yield* runtime.execute({ ...baseInput, script: "while (true) {}" })
        }).pipe(Effect.provide(EvaluationScriptRuntimeLive), Effect.provide(layer)),
      ),
    ).rejects.toMatchObject({ _tag: "EvaluationExecutionError" })
  })
})
