import { type formatGenAIConversation, formatGenAIMessage, type GenerateTelemetryCapture } from "@domain/ai"
import { estimateCost } from "@domain/models"
import { Effect } from "effect"
import { z } from "zod"
import { type EvaluationRuntimeMetadata, EvaluationScriptRuntime } from "../ports/evaluation-script-runtime.ts"
import { evaluationVerdictJsonSchema } from "./json-schema.ts"

// Pin the script-runtime judge to a low-reasoning, low-cost hosted model until evaluation settings support model choice.
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

const INTERPOLATION_PATTERN = /\$\{([^}]+)\}/g

export const EVALUATION_CONVERSATION_PLACEHOLDER = ["${", "conversation}"].join("")
export const EVALUATION_CONVERSATION_TEXT_PLACEHOLDER = ["${", "conversationText}"].join("")

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
  feedback: z.string().min(1),
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

export const buildJsonSchemaJudgeScript = (prompt: string): string => `const verdictSchema = ${JSON.stringify(
  evaluationVerdictJsonSchema,
  null,
  2,
)}

const result = await llm(\`${prompt}\`, {
  schema: verdictSchema,
})

if (result.passed) {
  return Passed(1, result.feedback)
}

return Failed(0, result.feedback)`

export const wrapPromptAsEvaluationScript = (prompt: string): string => buildJsonSchemaJudgeScript(prompt)

export const wrapPromptAsLegacyMvpEvaluationScript = (prompt: string): string =>
  MVP_SCRIPT_PREFIX + prompt + MVP_SCRIPT_SUFFIX

export const extractPromptFromEvaluationScript = (script: string): string | null => {
  const trimmed = script.trim()
  if (!trimmed.startsWith(MVP_SCRIPT_PREFIX) || !trimmed.endsWith(MVP_SCRIPT_SUFFIX)) {
    return null
  }

  return trimmed.slice(MVP_SCRIPT_PREFIX.length, trimmed.length - MVP_SCRIPT_SUFFIX.length)
}

export const normalizeLegacyEvaluationScript = (script: string): string => {
  const prompt = extractPromptFromEvaluationScript(script)
  if (prompt === null) return script

  return buildJsonSchemaJudgeScript(
    prompt.replaceAll(EVALUATION_CONVERSATION_PLACEHOLDER, EVALUATION_CONVERSATION_TEXT_PLACEHOLDER),
  )
}

export const validateEvaluationScript = (script: string): boolean => {
  const prompt = extractPromptFromEvaluationScript(script)
  if (prompt === null) return script.trim().length > 0

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

// Alignment and optimization examples hydrate conversations without trace accounting fields.
// Live evaluation execution passes trace-derived metadata explicitly.
const buildDefaultEvaluationRuntimeMetadata = (
  conversation: readonly EvaluationConversationMessage[],
): EvaluationRuntimeMetadata => ({
  duration: 0,
  usage: {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
  cost: 0,
  turns: conversation.length,
})

export const executeEvaluationScriptWithAI = Effect.fn("evaluations.executeEvaluationScriptWithRuntime")(
  function* (input: {
    readonly script: string
    readonly conversation: readonly EvaluationConversationMessage[]
    readonly issue: EvaluationIssueContext
    readonly metadata?: EvaluationRuntimeMetadata
    readonly telemetry?: GenerateTelemetryCapture
  }) {
    yield* Effect.annotateCurrentSpan("evaluation.conversationMessageCount", input.conversation.length)

    const runtime = yield* EvaluationScriptRuntime

    return yield* runtime.execute({
      script: normalizeLegacyEvaluationScript(input.script),
      conversation: input.conversation,
      metadata: input.metadata ?? buildDefaultEvaluationRuntimeMetadata(input.conversation),
      issue: input.issue,
      ...(input.telemetry ? { telemetry: input.telemetry } : {}),
    })
  },
)
