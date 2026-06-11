import type { GenerateInput, GenerateResult } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import {
  EVALUATION_CONVERSATION_PLACEHOLDER,
  type EvaluationConversationMessage,
  type EvaluationIssueContext,
  executeEvaluationScript,
  executeEvaluationScriptSandboxed,
  wrapPromptAsEvaluationScript,
} from "@domain/evaluations"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { QuickJsScriptRuntimeLive } from "./runtime.ts"

/**
 * Migration parity (specs/sandbox-runtime.md, P1-1): for every stored
 * template script, the legacy extract-and-call executor and the sandbox
 * executor must produce the same llm request and the same
 * EvaluationExecutionResultPayload.
 */
const conversation: readonly EvaluationConversationMessage[] = [
  { role: "user", content: "Please summarize the deployment checklist." },
  { role: "assistant", content: "Verify migrations, rollback steps, and dashboards after deploy." },
]

const issue: EvaluationIssueContext = {
  name: "Deployment checklist omission",
  description: "The assistant fails to mention key deployment steps.",
}

const TEMPLATE_PROMPTS = [
  [
    "Review the following conversation for the target issue.",
    "",
    "Conversation:",
    EVALUATION_CONVERSATION_PLACEHOLDER,
    "",
    "Set passed to true when the issue is absent.",
  ].join("\n"),
  `Does this trace exhibit the issue? ${EVALUATION_CONVERSATION_PLACEHOLDER}`,
  [
    "You are judging the conversation below twice over.",
    EVALUATION_CONVERSATION_PLACEHOLDER,
    "Again, for emphasis:",
    EVALUATION_CONVERSATION_PLACEHOLDER,
  ].join("\n"),
]

const judgment = (passed: boolean) => ({
  passed,
  feedback: passed ? "The conversation does not exhibit the issue." : "The conversation exhibits the issue.",
})

const TOKENS = 120
const TOKEN_USAGE = { input: 40, output: 80 }
const DURATION_NS = 456_000_000

const runLegacy = async (script: string, passed: boolean) => {
  const prompts: string[] = []
  const execution = await executeEvaluationScript({
    script,
    conversation,
    issue,
    generateStructuredObject: async ({ prompt, schema }) => {
      prompts.push(prompt)
      return {
        object: schema.parse(judgment(passed)),
        tokens: TOKENS,
        duration: DURATION_NS,
        tokenUsage: TOKEN_USAGE,
      }
    },
  })
  return { prompts, execution }
}

const runSandboxed = async (script: string, passed: boolean) => {
  const { layer: aiLayer, calls } = createFakeAI({
    generate: <T>(input: GenerateInput<T>) =>
      Effect.succeed({
        object: input.schema.parse(judgment(passed)),
        tokens: TOKENS,
        duration: DURATION_NS,
        tokenUsage: TOKEN_USAGE,
      } satisfies GenerateResult<T>),
  })

  const execution = await Effect.runPromise(
    executeEvaluationScriptSandboxed({ script, conversation, issue }).pipe(
      Effect.provide(Layer.mergeAll(aiLayer, QuickJsScriptRuntimeLive)),
    ),
  )

  return { prompts: calls.generate.map((call) => call.prompt), execution }
}

describe("evaluation executor parity: legacy template bridge vs sandbox runtime", () => {
  for (const [index, prompt] of TEMPLATE_PROMPTS.entries()) {
    for (const passed of [true, false]) {
      it(`template #${index + 1} (${passed ? "passed" : "failed"} judgment) produces the same llm request and result payload`, async () => {
        const script = wrapPromptAsEvaluationScript(prompt)

        const legacy = await runLegacy(script, passed)
        const sandboxed = await runSandboxed(script, passed)

        expect(sandboxed.prompts).toEqual(legacy.prompts)
        expect(sandboxed.execution.result).toEqual(legacy.execution.result)
        expect(sandboxed.execution.totalTokens).toBe(legacy.execution.totalTokens)
        expect(sandboxed.execution.totalCostMicrocents).toBe(legacy.execution.totalCostMicrocents)
      })
    }
  }

  it("documents the intentional duration semantics change across executors", async () => {
    // Legacy reports the model call's own duration as totalDurationNs; the
    // sandbox reports the whole run's wall time including host calls, per
    // the RunResult contract in specs/sandbox-runtime.md. Same units, but
    // not the same measurement — this is the one acknowledged non-parity.
    const script = wrapPromptAsEvaluationScript(`Judge: ${EVALUATION_CONVERSATION_PLACEHOLDER}`)

    const legacy = await runLegacy(script, true)
    expect(legacy.execution.totalDurationNs).toBe(DURATION_NS)

    const HOST_DELAY_MS = 25
    const { layer: aiLayer } = createFakeAI({
      generate: <T>(input: GenerateInput<T>) =>
        Effect.promise(async () => {
          await new Promise((resolve) => setTimeout(resolve, HOST_DELAY_MS))
          return {
            object: input.schema.parse(judgment(true)),
            tokens: TOKENS,
            duration: DURATION_NS,
            tokenUsage: TOKEN_USAGE,
          } satisfies GenerateResult<T>
        }),
    })
    const sandboxedExecution = await Effect.runPromise(
      executeEvaluationScriptSandboxed({ script, conversation, issue }).pipe(
        Effect.provide(Layer.mergeAll(aiLayer, QuickJsScriptRuntimeLive)),
      ),
    )

    expect(sandboxedExecution.totalDurationNs).toBeGreaterThanOrEqual(HOST_DELAY_MS * 1_000_000)
  })

  it("resolves the conversation placeholder to the exact prompt text", async () => {
    const script = wrapPromptAsEvaluationScript(`Judge: ${EVALUATION_CONVERSATION_PLACEHOLDER}`)
    const { prompts } = await runSandboxed(script, true)

    expect(prompts).toEqual([
      [
        "Judge: [user] Please summarize the deployment checklist.",
        "[assistant] Verify migrations, rollback steps, and dashboards after deploy.",
      ].join("\n"),
    ])
  })
})
