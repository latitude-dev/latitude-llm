import { type formatGenAIConversation, formatGenAIMessage } from "@domain/ai"
import { estimateCost, getModelForProvider } from "@domain/models"
import { getEncoding, type Tiktoken } from "js-tiktoken"
import { z } from "zod"

export const EVALUATION_DEFAULT_SCRIPT_RUNTIME_MODEL = {
  provider: "amazon-bedrock",
  model: "minimax.minimax-m2.5",
  reasoning: "low",
} as const

/** Mirrors ai-vercel's `DEFAULT_MAX_OUTPUT_TOKENS`; used when a judge config doesn't override `maxTokens`. */
const DEFAULT_JUDGE_MAX_OUTPUT_TOKENS = 8_192

/** Mirrors the minimax → gpt-oss-120b fallback pairing in `resolveGenerateFallback` (`@platform/ai-vercel`'s ai.ts). */
const BEDROCK_MINIMAX_MODEL_ID = "minimax.minimax-m2.5"
const BEDROCK_MINIMAX_FALLBACK_MODEL = { provider: "amazon-bedrock", model: "openai.gpt-oss-120b-1:0" } as const

/** Assumed context for a judge model missing from the models.dev registry (e.g. a self-hosted `custom` model). */
const FALLBACK_JUDGE_CONTEXT_LIMIT_TOKENS = 16_000

/** Extra headroom on top of the reserved output budget, absorbing tokenizer drift across providers. */
const CONTEXT_SAFETY_MARGIN_TOKENS = 500

const PROMPT_TRUNCATION_NOTICE = "\n\n[... middle truncated: input exceeded the judge model's context window ...]\n\n"

let encoder: Tiktoken | null = null
const tokenizer = (): Tiktoken => (encoder ??= getEncoding("o200k_base"))

const resolveJudgeContextLimitTokens = (provider: string, model: string): number => {
  const primaryLimit = getModelForProvider(provider, model)?.contextLimit ?? FALLBACK_JUDGE_CONTEXT_LIMIT_TOKENS
  if (provider !== BEDROCK_MINIMAX_FALLBACK_MODEL.provider || model !== BEDROCK_MINIMAX_MODEL_ID) {
    return primaryLimit
  }
  const fallbackLimit =
    getModelForProvider(BEDROCK_MINIMAX_FALLBACK_MODEL.provider, BEDROCK_MINIMAX_FALLBACK_MODEL.model)?.contextLimit ??
    primaryLimit
  return Math.min(primaryLimit, fallbackLimit)
}

/** Trims an unbounded evaluation-script judge prompt to fit the resolved model's (and its Bedrock fallback's) context window, keeping the head and tail intact. */
export const fitPromptToJudgeContextWindow = (
  prompt: string,
  provider: string,
  model: string,
  maxOutputTokens: number = DEFAULT_JUDGE_MAX_OUTPUT_TOKENS,
): string => {
  const contextLimitTokens = resolveJudgeContextLimitTokens(provider, model)
  const budgetTokens = Math.max(contextLimitTokens - maxOutputTokens - CONTEXT_SAFETY_MARGIN_TOKENS, 0)

  const tokens = tokenizer().encode(prompt)
  if (tokens.length <= budgetTokens) {
    return prompt
  }

  const noticeTokens = tokenizer().encode(PROMPT_TRUNCATION_NOTICE).length
  const keepTokens = Math.max(budgetTokens - noticeTokens, 0)
  const headTokens = Math.ceil(keepTokens / 2)
  const tailTokens = keepTokens - headTokens

  const head = tokenizer().decode(tokens.slice(0, headTokens))
  const tail = tailTokens > 0 ? tokenizer().decode(tokens.slice(tokens.length - tailTokens)) : ""

  return `${head}${PROMPT_TRUNCATION_NOTICE}${tail}`
}

export const EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT = `You are executing a generated evaluation script on behalf of Latitude.

Given the script's prompt and instructions, return the structured result requested by the schema.
Do not mention that you are simulating execution. Follow the prompt exactly and produce only schema-valid output.`

// Teaches the model the exact sandbox contract (globals + frozen `session` shape) it must target.
// Mirror this verbatim against the QuickJS prelude (@platform/sandbox-quickjs prelude.ts) and the
// ScriptSessionContext port doc (@domain/sandbox script-runtime.ts) whenever either changes.
export const EVALUATION_SCRIPT_GENERATION_SYSTEM_PROMPT = `You write Latitude evaluation scripts. An evaluation script inspects one agent session and returns a score in [0, 1] saying whether some behavior is present.

Your output is the script body ONLY — raw JavaScript statements, no function wrapper, no \`export\`, no markdown code fences, no commentary. The body runs as an async function, so top-level \`await\` is allowed. It MUST end by returning a score object built with one of the score globals below.

Score globals (use these, never construct the object by hand):
- Score(value, feedback?) — value is a number in [0, 1]; feedback is an optional string.
- Passed(value?, feedback?) — value defaults to 1.
- Failed(value?, feedback?) — value defaults to 0.

Available globals:
- session — the frozen session being evaluated (shape below). The only data input.
- llm(prompt, { schema }) — async; asks an LLM to judge text. \`prompt\` is a string, \`schema\` MUST be a \`z\` schema (almost always \`z.object({ ... })\`). Returns the parsed object. Use this for nuanced judgments that need reasoning; prefer deterministic checks on \`session\` when the rule is mechanical.
- semanticSimilarity(query) — async; returns a number in [0, 1], the highest cosine similarity between \`query\` and any message in this session (0 if the session has no messages). \`query\` is a short phrase describing the concept (e.g. "user is frustrated", "asking for a refund"). Cheap: it reuses precomputed message embeddings and embeds the query once. Prefer it over llm() for "is the conversation about X?" topic/theme checks; use llm() when the judgment needs reasoning beyond similarity. Typical thresholds: ~0.4 broad, ~0.55 balanced, ~0.7 strict.
- parse(value, schema) — validates \`value\` against a \`z\` schema and returns it.
- z — schema builder: z.string(), z.number(), z.boolean(), z.literal(v), z.enum([...]), z.array(el), z.object({...}), z.union([...]); chainable .optional(), .nullable(), .describe(s); strings/numbers support .min/.max, numbers also .int().

Not available: imports/require, fetch/network, timers, Date.now/Math.random as entropy, Node or browser APIs. Only the globals above exist.

The \`session\` object (all numbers are base units — durations in nanoseconds, costs in microcents, tokens as counts):
{
  id: string,
  traceCount: number, spanCount: number, errorCount: number,
  duration: number, timeToFirstToken: number,
  cost: { input: number, output: number, total: number },
  tokens: { input: number, output: number, total: number, cacheRead: number, cacheCreate: number, reasoning: number },
  startTime: string, endTime: string,
  userId: string, tags: string[], metadata: Record<string, string>,
  conversation: { role: string, content: string }[],   // deduped session-wide transcript; String(session.conversation) renders "[role] content" lines
  traces: {
    id: string, name: string, status: string,
    errorCount: number, spanCount: number, duration: number, timeToFirstToken: number,
    cost: { input, output, total }, tokens: { input, output, total, cacheRead, cacheCreate, reasoning },
    models: string[], providers: string[], finishReasons: string[],
    tools: { name: string, input: string, output: string, error: boolean, duration: number }[]
  }[]
}

Rules:
- Return the script body only; no markdown fences, no surrounding function.
- Always end every reachable path with Score/Passed/Failed.
- Keep it focused on the behavior the user described. Use llm() only when a deterministic check over session cannot express it.
- When you call llm(), always pass a z.object schema and read fields off the returned object.`

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
