import { type formatGenAIConversation, formatGenAIMessage } from "@domain/ai"
import { estimateCost } from "@domain/models"
import { z } from "zod"

export const EVALUATION_DEFAULT_SCRIPT_RUNTIME_MODEL = {
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

export const EVALUATION_CONVERSATION_PLACEHOLDER = ["${", "session.conversation}"].join("")

export interface EvaluationConversationMessage {
  readonly role: string
  readonly content: string
}

export const evaluationSignalContextSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
})
export type EvaluationSignalContext = z.infer<typeof evaluationSignalContextSchema>

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

// Wraps a judge prompt into the MVP sandbox script (one `llm()` call returning the present-verdict
// Passed/Failed). The single source of the judge wrapper, shared by baseline + settings codegen.
export const wrapPromptAsEvaluationScript = (prompt: string): string => MVP_SCRIPT_PREFIX + prompt + MVP_SCRIPT_SUFFIX

export const toEvaluationConversationMessages = (
  allMessages: Parameters<typeof formatGenAIConversation>[0],
): readonly EvaluationConversationMessage[] =>
  allMessages.map((message) => ({
    role: message.role,
    content: formatGenAIMessage(message),
  }))

export const estimateEvaluationScriptCostMicrocents = (
  result: {
    readonly tokens: number
    readonly tokenUsage?: {
      readonly input: number
      readonly output: number
      readonly reasoning?: number | undefined
      readonly cacheRead?: number | undefined
      readonly cacheWrite?: number | undefined
    }
  },
  costModel: { readonly provider: string; readonly model: string } = EVALUATION_DEFAULT_SCRIPT_RUNTIME_MODEL,
): number => {
  const usage = result.tokenUsage ?? {
    input: 0,
    output: result.tokens,
  }

  return Math.round(estimateCost(costModel.provider, costModel.model, usage) * 100_000_000)
}

export const toEvaluationExecutionResult = (result: EvaluationScriptExecution): EvaluationExecutionResult =>
  evaluationExecutionResultSchema.parse({
    result: result.result,
    duration: result.totalDurationNs,
    tokens: result.totalTokens,
    cost: result.totalCostMicrocents,
  })
