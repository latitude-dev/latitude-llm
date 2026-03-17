/**
 * Content parser for OTEL GenAI deprecated convention (pre-v1.37) and OpenLLMetry.
 *
 * Both use the same attribute keys:
 *   gen_ai.prompt     — single JSON string with array of {role, content} messages
 *   gen_ai.completion — single JSON string with array of {role, content} messages
 *
 * The JSON content is in provider-native format (typically OpenAI-style {role, content}).
 * We use rosetta-ai's auto-detection to translate to GenAI format.
 *
 * OpenLLMetry additionally defines:
 *   llm.request.functions — JSON string array of function/tool definitions
 */
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { safeTranslate } from "rosetta-ai"
import type { ToolDefinition } from "../../entities/span.ts"
import type { OtlpKeyValue } from "../types.ts"
import type { ParsedContent } from "./index.ts"
import { toToolDefinition } from "./utils.ts"

function parseJsonString(attrs: readonly OtlpKeyValue[], key: string): unknown {
  const kv = attrs.find((a) => a.key === key)
  if (!kv?.value?.stringValue) return undefined
  try {
    return JSON.parse(kv.value.stringValue)
  } catch {
    return undefined
  }
}

function translateMessages(raw: unknown, direction: "input" | "output"): GenAIMessage[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  const result = safeTranslate(raw, { direction })
  if (result.error) return []
  return result.messages as GenAIMessage[]
}

export function parseGenAIDeprecated(attrs: readonly OtlpKeyValue[]): ParsedContent {
  const promptRaw = parseJsonString(attrs, "gen_ai.prompt")
  const completionRaw = parseJsonString(attrs, "gen_ai.completion")

  let inputMessages: GenAIMessage[] = []
  let systemInstructions: GenAISystem = []

  if (Array.isArray(promptRaw) && promptRaw.length > 0) {
    const result = safeTranslate(promptRaw, { direction: "input" })
    if (!result.error) {
      inputMessages = result.messages as GenAIMessage[]
      if (result.system) {
        systemInstructions = result.system
      }
    }
  }

  const outputMessages = translateMessages(completionRaw, "output")

  const functionsRaw = parseJsonString(attrs, "llm.request.functions")
  const toolDefinitions: ToolDefinition[] = Array.isArray(functionsRaw)
    ? (functionsRaw.map(toToolDefinition).filter(Boolean) as ToolDefinition[])
    : []

  return { inputMessages, outputMessages, systemInstructions, toolDefinitions }
}
