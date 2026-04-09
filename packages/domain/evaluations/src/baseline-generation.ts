import { z } from "zod"

export type EvaluationScriptSchema<T> = z.ZodType<T>

export const evaluationRuntimeZod = z

export const EVALUATION_SCRIPT_RUNTIME_MODEL = {
  provider: "openai",
  model: "gpt-5.4",
  reasoning: "low",
} as const

export const EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT = `You are executing a generated evaluation script on behalf of Latitude.

Given the script's prompt and instructions, return the structured result requested by the schema.
Do not mention that you are simulating execution. Follow the prompt exactly and produce only schema-valid output.`

// ---------------------------------------------------------------------------
// MVP script template
//
// All evaluations are constrained to a fixed LLM-as-judge shape where only
// the prompt text varies. The script is stored as valid JS source, but
// execution extracts the prompt and calls llm() directly via the host.
//
// TODO(eval-sandbox): remove the MVP template constraint and allow arbitrary
// JS evaluation scripts once a proper sandboxed runtime is implemented.
// ---------------------------------------------------------------------------

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

export const CONVERSATION_PLACEHOLDER = ["${", "conversation}"].join("")
const INTERPOLATION_PATTERN = /\$\{([^}]+)\}/g

export const wrapPromptAsScript = (prompt: string): string => MVP_SCRIPT_PREFIX + prompt + MVP_SCRIPT_SUFFIX

export const extractPromptFromScript = (script: string): string | null => {
  const trimmed = script.trim()
  if (!trimmed.startsWith(MVP_SCRIPT_PREFIX) || !trimmed.endsWith(MVP_SCRIPT_SUFFIX)) {
    return null
  }
  return trimmed.slice(MVP_SCRIPT_PREFIX.length, trimmed.length - MVP_SCRIPT_SUFFIX.length)
}

export const validateEvaluationScript = (script: string): boolean => {
  const prompt = extractPromptFromScript(script)
  if (prompt === null) return false

  if (prompt.includes("`")) return false

  for (const match of prompt.matchAll(INTERPOLATION_PATTERN)) {
    if (match[0] !== CONVERSATION_PLACEHOLDER) return false
  }

  return true
}

export interface ConversationMessage {
  readonly role: string
  readonly content: string
}

export const formatConversationForPrompt = (conversation: readonly ConversationMessage[]): string =>
  conversation.map((message) => `[${message.role}] ${message.content}`).join("\n")

export const generateBaselinePromptText = (issueName: string, issueDescription: string): string =>
  [
    `You are evaluating a conversation for the following issue.`,
    ``,
    `Issue: ${issueName}`,
    `Description: ${issueDescription}`,
    ``,
    `Conversation:`,
    CONVERSATION_PLACEHOLDER,
    ``,
    `Determine whether the conversation exhibits the described issue.`,
    `If the issue is present, set passed to false. If the issue is absent, set passed to true.`,
    `Provide a brief feedback explanation for your decision.`,
  ].join("\n")
