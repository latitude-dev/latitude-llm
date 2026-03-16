import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import type { ToolDefinition } from "../../entities/span.ts"
import { stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"
import { parseGenAICurrent } from "./genai.ts"
import { parseGenAIDeprecated } from "./genai_deprecated.ts"
import { parseOpenInference } from "./openinference.ts"
import { parseVercel } from "./vercel.ts"

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
    canHandle: (attrs) => hasKey(attrs, "gen_ai.prompt") || hasKey(attrs, "gen_ai.completion"),
    parse: parseGenAIDeprecated,
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
