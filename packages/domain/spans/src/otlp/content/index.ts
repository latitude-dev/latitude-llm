import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import type { ToolDefinition } from "../../entities/span.ts"
import { stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"
import { CLAUDE_CODE_CONTENT_ATTRIBUTE_KEYS, parseClaudeCode } from "./claude-code.ts"
import { FLUE_CONTENT_ATTRIBUTE_KEYS, parseFlue } from "./flue.ts"
import { GENAI_CONTENT_ATTRIBUTE_KEYS, parseGenAICurrent } from "./genai.ts"
import { GENAI_DEPRECATED_CONTENT_ATTRIBUTE_KEYS, parseGenAIDeprecated } from "./genai_deprecated.ts"
import { JSON_VALUE_CONTENT_ATTRIBUTE_KEYS, parseJsonValue } from "./json-value.ts"
import { LIVEKIT_CONTENT_ATTRIBUTE_KEYS, parseLiveKit } from "./livekit.ts"
import { OPENINFERENCE_CONTENT_ATTRIBUTE_KEYS, parseOpenInference } from "./openinference.ts"
import { parseVercel, VERCEL_CONTENT_ATTRIBUTE_KEYS } from "./vercel.ts"

export interface ParsedContent {
  readonly inputMessages: readonly GenAIMessage[]
  readonly outputMessages: readonly GenAIMessage[]
  readonly systemInstructions: GenAISystem
  readonly toolDefinitions: readonly ToolDefinition[]
}

const EMPTY_CONTENT: ParsedContent = {
  inputMessages: [],
  outputMessages: [],
  systemInstructions: [],
  toolDefinitions: [],
}

interface ContentParser {
  canHandle(attrs: readonly OtlpKeyValue[]): boolean
  parse(attrs: readonly OtlpKeyValue[]): ParsedContent
}

function hasKey(attrs: readonly OtlpKeyValue[], key: string): boolean {
  return attrs.some((a) => a.key === key)
}

function hasKeyPrefix(attrs: readonly OtlpKeyValue[], prefix: string): boolean {
  return attrs.some((a) => a.key.startsWith(prefix))
}

const PARSERS: readonly ContentParser[] = [
  {
    canHandle: (attrs) => hasKey(attrs, "gen_ai.input.messages") || hasKey(attrs, "gen_ai.output.messages"),
    parse: parseGenAICurrent,
  },
  {
    canHandle: (attrs) =>
      hasKeyPrefix(attrs, "llm.input_messages.") ||
      hasKeyPrefix(attrs, "llm.output_messages.") ||
      (stringAttr(attrs, "openinference.span.kind") !== undefined && hasKeyPrefix(attrs, "llm.")),
    parse: parseOpenInference,
  },
  {
    canHandle: (attrs) => hasKey(attrs, "ai.prompt") || hasKey(attrs, "ai.prompt.messages"),
    parse: parseVercel,
  },
  {
    // Handles both JSON string format (gen_ai.prompt = "[...]") and
    // flattened indexed format (gen_ai.prompt.0.role, gen_ai.prompt.0.content)
    canHandle: (attrs) =>
      hasKey(attrs, "gen_ai.prompt") ||
      hasKey(attrs, "gen_ai.completion") ||
      hasKeyPrefix(attrs, "gen_ai.prompt.") ||
      hasKeyPrefix(attrs, "gen_ai.completion."),
    parse: parseGenAIDeprecated,
  },
  {
    canHandle: (attrs) =>
      hasKey(attrs, "lk.chat_ctx") ||
      hasKey(attrs, "lk.response.text") ||
      hasKey(attrs, "lk.response.function_calls") ||
      hasKey(attrs, "lk.function_tools"),
    parse: parseLiveKit,
  },
  {
    canHandle: (attrs) => hasKey(attrs, "flue.turn.input") || hasKey(attrs, "flue.turn.output"),
    parse: parseFlue,
  },
  {
    canHandle: (attrs) => hasKey(attrs, "user_prompt"), // Claude Code
    parse: parseClaudeCode,
  },
  {
    canHandle: (attrs) => hasKey(attrs, "input.value") || hasKey(attrs, "output.value"),
    parse: parseJsonValue,
  },
]

export function parseContent(attrs: readonly OtlpKeyValue[]): ParsedContent {
  for (const parser of PARSERS) {
    if (parser.canHandle(attrs)) {
      return parser.parse(attrs)
    }
  }
  return EMPTY_CONTENT
}

interface ContentAttributeKeys {
  readonly exact: readonly string[]
  readonly prefixes: readonly string[]
}

/**
 * Every parser declares the keys it reads, and they are composed here rather than
 * restated in the redaction module. `transformSpan` copies each of these raw
 * attributes into `attr_string` alongside the parsed content columns, so ingest
 * redaction has to drop them or a verbatim plaintext copy survives in the same
 * ClickHouse row. Keeping the declaration next to each parser means a new vendor
 * parser gets redaction coverage when it is added, instead of silently drifting.
 */
const CONTENT_ATTRIBUTE_KEY_SOURCES: readonly ContentAttributeKeys[] = [
  GENAI_CONTENT_ATTRIBUTE_KEYS,
  GENAI_DEPRECATED_CONTENT_ATTRIBUTE_KEYS,
  OPENINFERENCE_CONTENT_ATTRIBUTE_KEYS,
  VERCEL_CONTENT_ATTRIBUTE_KEYS,
  LIVEKIT_CONTENT_ATTRIBUTE_KEYS,
  FLUE_CONTENT_ATTRIBUTE_KEYS,
  CLAUDE_CODE_CONTENT_ATTRIBUTE_KEYS,
  JSON_VALUE_CONTENT_ATTRIBUTE_KEYS,
]

const CONTENT_ATTRIBUTE_EXACT_KEYS: ReadonlySet<string> = new Set(
  CONTENT_ATTRIBUTE_KEY_SOURCES.flatMap((source) => source.exact),
)

const CONTENT_ATTRIBUTE_KEY_PREFIXES: readonly string[] = CONTENT_ATTRIBUTE_KEY_SOURCES.flatMap(
  (source) => source.prefixes,
)

/** True when a span attribute holds conversation content that a typed column already carries. */
export function isContentAttributeKey(key: string): boolean {
  if (CONTENT_ATTRIBUTE_EXACT_KEYS.has(key)) return true

  return CONTENT_ATTRIBUTE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}
