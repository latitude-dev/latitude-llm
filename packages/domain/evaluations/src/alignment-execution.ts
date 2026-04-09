import { AI, type GenerateResult } from "@domain/ai"
import { estimateCost } from "@domain/models"
import { Effect } from "effect"
import type {
  BaselineEvaluationExampleResult,
  BaselineEvaluationResult,
  EvaluationAlignmentConversationMessage,
  HydratedEvaluationAlignmentExample,
} from "./alignment-types.ts"
import {
  CONVERSATION_PLACEHOLDER,
  EVALUATION_SCRIPT_RUNTIME_MODEL,
  EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
  type EvaluationScriptSchema,
  evaluationRuntimeZod,
  extractPromptFromScript,
  formatConversationForPrompt,
} from "./baseline-generation.ts"
import { addConfusionMatrixObservation, deriveEvaluationAlignmentMetrics, emptyConfusionMatrix } from "./helpers.ts"

export interface EvaluationScriptExecution {
  readonly result: {
    readonly passed: boolean
    readonly value: number
    readonly feedback: string
  }
  readonly totalTokens: number
  readonly totalDurationNs: number
  readonly totalCostMicrocents: number
}

export const estimateEvaluationScriptCostMicrocents = (result: {
  readonly tokens: number
  readonly tokenUsage?: {
    readonly input: number
    readonly output: number
    readonly reasoning?: number | undefined
    readonly cacheRead?: number | undefined
    readonly cacheWrite?: number | undefined
  }
}): number => {
  const usage = result.tokenUsage ?? {
    input: 0,
    output: result.tokens,
  }

  return Math.round(
    estimateCost(EVALUATION_SCRIPT_RUNTIME_MODEL.provider, EVALUATION_SCRIPT_RUNTIME_MODEL.model, usage) * 100_000_000,
  )
}

const llmJudgeResultSchema = evaluationRuntimeZod.object({
  passed: evaluationRuntimeZod.boolean(),
  feedback: evaluationRuntimeZod.string(),
})

// TODO(eval-sandbox): replace this extract-and-call approach with a proper sandboxed JS runtime
// that executes the full script. The current implementation constrains all evaluations to an
// LLM-as-judge template. When sandbox lands, restore AsyncFunction-based execution with the
// full runtime contract (conversation, issue, z, llm, Passed, Failed).
export const executeEvaluationScript = async (input: {
  readonly script: string
  readonly conversation: readonly EvaluationAlignmentConversationMessage[]
  readonly issue: {
    readonly name: string
    readonly description: string
  }
  readonly generateStructuredObject: <T>(input: {
    readonly prompt: string
    readonly schema: EvaluationScriptSchema<T>
  }) => Promise<GenerateResult<T>>
}): Promise<EvaluationScriptExecution> => {
  const promptTemplate = extractPromptFromScript(input.script)
  if (promptTemplate === null) {
    throw new Error("Invalid evaluation script: does not match the expected LLM-as-judge template")
  }

  const conversationText = formatConversationForPrompt(input.conversation)
  const resolvedPrompt = promptTemplate.replaceAll(CONVERSATION_PLACEHOLDER, conversationText)

  const result = await input.generateStructuredObject({
    prompt: resolvedPrompt,
    schema: llmJudgeResultSchema,
  })

  const costMicrocents = estimateEvaluationScriptCostMicrocents(result)

  return {
    result: {
      passed: result.object.passed,
      value: result.object.passed ? 1 : 0,
      feedback: result.object.feedback,
    },
    totalTokens: result.tokens,
    totalDurationNs: result.duration,
    totalCostMicrocents: costMicrocents,
  }
}

// TODO(eval-sandbox): when sandbox is available, executeEvaluationScript will run arbitrary JS;
// this function delegates to it and its structure won't change.
export const evaluateDraftAgainstExamplesUseCase = (input: {
  readonly issueName: string
  readonly issueDescription: string
  readonly script: string
  readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
  readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
}) =>
  Effect.gen(function* () {
    const ai = yield* AI
    const services = yield* Effect.services<never>()
    const examples = [...input.positiveExamples, ...input.negativeExamples]
    let confusionMatrix = emptyConfusionMatrix()
    const exampleResults: BaselineEvaluationExampleResult[] = []

    const generateStructuredObject = <T>(llmInput: {
      readonly prompt: string
      readonly schema: EvaluationScriptSchema<T>
    }): Promise<GenerateResult<T>> =>
      Effect.runPromiseWith(services)(
        ai.generate({
          ...EVALUATION_SCRIPT_RUNTIME_MODEL,
          system: EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
          prompt: llmInput.prompt,
          schema: llmInput.schema,
        }),
      )

    for (const example of examples) {
      const execution = yield* Effect.tryPromise(() =>
        executeEvaluationScript({
          script: input.script,
          conversation: example.conversation,
          issue: {
            name: input.issueName,
            description: input.issueDescription,
          },
          generateStructuredObject,
        }),
      )

      const expectedPositive = example.label === "positive"
      const predictedPositive = execution.result.passed === false

      confusionMatrix = addConfusionMatrixObservation(confusionMatrix, {
        expectedPositive,
        predictedPositive,
      })

      exampleResults.push({
        traceId: example.traceId,
        expectedPositive,
        predictedPositive,
        feedback: execution.result.feedback,
      })
    }

    return {
      confusionMatrix,
      metrics: deriveEvaluationAlignmentMetrics(confusionMatrix),
      exampleResults,
    } satisfies BaselineEvaluationResult
  })
