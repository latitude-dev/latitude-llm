import {
  AI,
  AICredentialError,
  AIError,
  type formatGenAIConversation,
  formatGenAIMessage,
  type GenerateResult,
  type GenerateTelemetryCapture,
} from "@domain/ai"
import { estimateCost } from "@domain/models"
import { Effect } from "effect"
import { z } from "zod"
import { EvaluationExecutionError } from "../errors.ts"

export type EvaluationScriptSchema<T> = z.ZodType<T>

export const evaluationRuntimeZod = z

export const EVALUATION_SCRIPT_RUNTIME_MODEL = {
  provider: "amazon-bedrock",
  model: "minimax.minimax-m2.5",
  reasoning: "low",
} as const

export const EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT = `You are executing a generated evaluation script on behalf of Latitude.

Given the script's prompt and instructions, return the structured result requested by the schema.
Do not mention that you are simulating execution. Follow the prompt exactly and produce only schema-valid output.`

const MVP_SCRIPT_PREFIX = `const result = await llm(
  \``

const MVP_SCRIPT_SUFFIX = `\`,
  { schema: z.object({ passed: z.boolean(), feedback: z.string() }) }
)

if (result.passed) {
  return Passed(1, result.feedback)
} else {
  return Failed(0, result.feedback)
}`

const INVALID_EVALUATION_SCRIPT_MESSAGE = "Invalid evaluation script: does not match the expected LLM-as-judge template"
const INTERPOLATION_PATTERN = /\$\{([^}]+)\}/g

export const EVALUATION_CONVERSATION_PLACEHOLDER = ["${", "conversation}"].join("")

export interface EvaluationConversationMessage {
  readonly role: string
  readonly content: string
}

export const evaluationIssueContextSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
})
export type EvaluationIssueContext = z.infer<typeof evaluationIssueContextSchema>

export const evaluationExecutionResultPayloadSchema = z.object({
  passed: z.boolean(),
  value: z.number().min(0).max(1),
  feedback: z.string(),
})
export type EvaluationExecutionResultPayload = z.infer<typeof evaluationExecutionResultPayloadSchema>

export interface EvaluationScriptExecution {
  readonly result: EvaluationExecutionResultPayload
  readonly totalTokens: number
  readonly totalDurationNs: number
  readonly totalCostMicrocents: number
}

export const evaluationExecutionResultSchema = z.object({
  result: evaluationExecutionResultPayloadSchema,
  duration: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  cost: z.number().int().nonnegative(),
})
export type EvaluationExecutionResult = z.infer<typeof evaluationExecutionResultSchema>

export type ExecuteEvaluationScriptWithAIError = AIError | AICredentialError | EvaluationExecutionError

export const wrapPromptAsEvaluationScript = (prompt: string): string => MVP_SCRIPT_PREFIX + prompt + MVP_SCRIPT_SUFFIX

export const extractPromptFromEvaluationScript = (script: string): string | null => {
  const trimmed = script.trim()
  if (!trimmed.startsWith(MVP_SCRIPT_PREFIX) || !trimmed.endsWith(MVP_SCRIPT_SUFFIX)) {
    return null
  }

  return trimmed.slice(MVP_SCRIPT_PREFIX.length, trimmed.length - MVP_SCRIPT_SUFFIX.length)
}

export const validateEvaluationScript = (script: string): boolean => {
  const prompt = extractPromptFromEvaluationScript(script)
  if (prompt === null) return false

  if (prompt.includes("`")) return false

  for (const match of prompt.matchAll(INTERPOLATION_PATTERN)) {
    if (match[0] !== EVALUATION_CONVERSATION_PLACEHOLDER) return false
  }

  return true
}

export const toEvaluationConversationMessages = (
  allMessages: Parameters<typeof formatGenAIConversation>[0],
): readonly EvaluationConversationMessage[] =>
  allMessages.map((message) => ({
    role: message.role,
    content: formatGenAIMessage(message),
  }))

export const formatEvaluationConversationForPrompt = (conversation: readonly EvaluationConversationMessage[]): string =>
  conversation.map((message) => `[${message.role}] ${message.content}`).join("\n")

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

export const toEvaluationExecutionResult = (result: EvaluationScriptExecution): EvaluationExecutionResult =>
  evaluationExecutionResultSchema.parse({
    result: result.result,
    duration: result.totalDurationNs,
    tokens: result.totalTokens,
    cost: result.totalCostMicrocents,
  })

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
  readonly conversation: readonly EvaluationConversationMessage[]
  readonly issue: EvaluationIssueContext
  readonly generateStructuredObject: <T>(input: {
    readonly prompt: string
    readonly schema: EvaluationScriptSchema<T>
  }) => Promise<GenerateResult<T>>
}): Promise<EvaluationScriptExecution> => {
  const promptTemplate = extractPromptFromEvaluationScript(input.script)
  if (promptTemplate === null) {
    throw new Error(INVALID_EVALUATION_SCRIPT_MESSAGE)
  }

  const conversationText = formatEvaluationConversationForPrompt(input.conversation)
  const resolvedPrompt = promptTemplate.replaceAll(EVALUATION_CONVERSATION_PLACEHOLDER, conversationText)

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

export const executeEvaluationScriptWithAI = Effect.fn("evaluations.executeEvaluationScriptWithAi")(function* (input: {
  readonly script: string
  readonly conversation: readonly EvaluationConversationMessage[]
  readonly issue: EvaluationIssueContext
  readonly telemetry?: GenerateTelemetryCapture
}) {
  yield* Effect.annotateCurrentSpan("evaluation.conversationMessageCount", input.conversation.length)

  const ai = yield* AI
  const services = yield* Effect.services<never>()

  return yield* Effect.tryPromise({
    try: () =>
      executeEvaluationScript({
        script: input.script,
        conversation: input.conversation,
        issue: input.issue,
        generateStructuredObject: <T>(llmInput: {
          readonly prompt: string
          readonly schema: EvaluationScriptSchema<T>
        }): Promise<GenerateResult<T>> =>
          Effect.runPromiseWith(services)(
            ai.generate({
              ...EVALUATION_SCRIPT_RUNTIME_MODEL,
              system: EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT,
              prompt: llmInput.prompt,
              schema: llmInput.schema,
              ...(input.telemetry ? { telemetry: input.telemetry } : {}),
            }),
          ),
      }),
    catch: (error) => {
      if (error instanceof AIError || error instanceof AICredentialError) {
        return error
      }

      return new EvaluationExecutionError({
        message: error instanceof Error ? error.message : "Evaluation execution failed",
      })
    },
  })
})
