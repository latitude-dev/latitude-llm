/**
 * Below are the semantic conventions for the Vercel AI SDK.
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/telemetry#collected-data
 */
const AI_PREFIX = 'ai' as const

const AIPrefixes = {
  settings: 'settings',
  model: 'model',
  usage: 'usage',
  telemetry: 'telemetry',
  prompt: 'prompt',
  toolCall: 'toolCall',
  response: 'response',
} as const

const AIUsagePostfixes = {
  completionTokens: 'completionTokens',
  promptTokens: 'promptTokens',
} as const

const AIResultPostfixes = {
  text: 'text',
  toolCalls: 'toolCalls',
  object: 'object',
} as const

const AIPromptPostfixes = {
  messages: 'messages',
} as const

const AIToolCallPostfixes = {
  id: 'id',
  name: 'name',
  args: 'args',
  result: 'result',
} as const

const SETTINGS = `${AI_PREFIX}.${AIPrefixes.settings}` as const

const MODEL_ID = `${AI_PREFIX}.${AIPrefixes.model}.id` as const

const METADATA = `${AI_PREFIX}.${AIPrefixes.telemetry}.metadata` as const

const TOKEN_COUNT_COMPLETION =
  `${AI_PREFIX}.${AIPrefixes.usage}.${AIUsagePostfixes.completionTokens}` as const

const TOKEN_COUNT_PROMPT =
  `${AI_PREFIX}.${AIPrefixes.usage}.${AIUsagePostfixes.promptTokens}` as const

const RESPONSE_TEXT =
  `${AI_PREFIX}.${AIPrefixes.response}.${AIResultPostfixes.text}` as const

const RESPONSE_TOOL_CALLS =
  `${AI_PREFIX}.${AIPrefixes.response}.${AIResultPostfixes.toolCalls}` as const

const RESULT_OBJECT =
  `${AI_PREFIX}.${AIPrefixes.response}.${AIResultPostfixes.object}` as const

const PROMPT = `${AI_PREFIX}.${AIPrefixes.prompt}` as const

const PROMPT_MESSAGES = `${PROMPT}.${AIPromptPostfixes.messages}` as const

const EMBEDDING_TEXT = `${AI_PREFIX}.value` as const
const EMBEDDING_VECTOR = `${AI_PREFIX}.embedding` as const

const EMBEDDING_TEXTS = `${AI_PREFIX}.values` as const
const EMBEDDING_VECTORS = `${AI_PREFIX}.embeddings` as const

const TOOL_CALL_ID =
  `${AI_PREFIX}.${AIPrefixes.toolCall}.${AIToolCallPostfixes.id}` as const
const TOOL_CALL_NAME =
  `${AI_PREFIX}.${AIPrefixes.toolCall}.${AIToolCallPostfixes.name}` as const
const TOOL_CALL_ARGS =
  `${AI_PREFIX}.${AIPrefixes.toolCall}.${AIToolCallPostfixes.args}` as const
const TOOL_CALL_RESULT =
  `${AI_PREFIX}.${AIPrefixes.toolCall}.${AIToolCallPostfixes.result}` as const

/**
 * The semantic conventions used by the Vercel AI SDK.
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/telemetry#collected-data
 */
export const AISemanticConventions = {
  MODEL_ID,
  METADATA,
  SETTINGS,
  TOKEN_COUNT_COMPLETION,
  TOKEN_COUNT_PROMPT,
  RESPONSE_TEXT,
  RESPONSE_TOOL_CALLS,
  RESULT_OBJECT,
  PROMPT,
  PROMPT_MESSAGES,
  EMBEDDING_TEXT,
  EMBEDDING_VECTOR,
  EMBEDDING_TEXTS,
  EMBEDDING_VECTORS,
  TOOL_CALL_ID,
  TOOL_CALL_NAME,
  TOOL_CALL_ARGS,
  TOOL_CALL_RESULT,
} as const

export const AISemanticConventionsList = Object.freeze(
  Object.values(AISemanticConventions),
)

export type AISemanticConvention =
  (typeof AISemanticConventions)[keyof typeof AISemanticConventions]
