/**
 * Content parser for OTEL GenAI deprecated convention (pre-v1.37) and OpenLLMetry.
 *
 * Supports two serialization formats for the same data:
 *
 * 1. JSON string format (original OpenLLMetry):
 *    gen_ai.prompt     — single JSON string with array of {role, content} messages
 *    gen_ai.completion — single JSON string with array of {role, content} messages
 *
 * 2. Flattened indexed format (Traceloop instrumentors):
 *    gen_ai.prompt.{i}.role    — message role
 *    gen_ai.prompt.{i}.content — message content
 *    gen_ai.completion.{i}.role    — completion role
 *    gen_ai.completion.{i}.content — completion content
 *    gen_ai.prompt.{i}.tool_calls.{j}.id/name/arguments — tool calls
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

/**
 * Reassemble flattened indexed attributes into message arrays.
 * e.g. gen_ai.prompt.0.role, gen_ai.prompt.0.content → [{role, content}]
 */
function reassembleIndexedMessages(attrs: readonly OtlpKeyValue[], prefix: string): Record<string, unknown>[] {
  const messageMap = new Map<number, Record<string, unknown>>()

  for (const { key, value } of attrs) {
    if (!key.startsWith(`${prefix}.`)) continue

    const rest = key.slice(prefix.length + 1)
    const dotIndex = rest.indexOf(".")
    const indexStr = dotIndex === -1 ? rest : rest.slice(0, dotIndex)
    const index = parseInt(indexStr, 10)
    if (Number.isNaN(index)) continue

    const field = dotIndex === -1 ? undefined : rest.slice(dotIndex + 1)
    if (!field) continue

    if (!messageMap.has(index)) {
      messageMap.set(index, {})
    }
    const msg = messageMap.get(index)!

    const attrValue = value?.stringValue ?? value?.intValue?.toString() ?? value?.boolValue?.toString()
    if (attrValue === undefined) continue

    if (field === "role") {
      msg.role = attrValue
    } else if (field === "content") {
      msg.content = attrValue
    } else if (field === "tool_call_id") {
      msg.tool_call_id = attrValue
    } else if (field === "tool_name") {
      msg.tool_name = attrValue
    } else if (field === "tool_result") {
      msg.tool_result = attrValue
    } else if (field.startsWith("tool_calls.")) {
      if (!msg.tool_calls) msg.tool_calls = []
      const tcRest = field.slice("tool_calls.".length)
      const tcDotIndex = tcRest.indexOf(".")
      const tcIndexStr = tcDotIndex === -1 ? tcRest : tcRest.slice(0, tcDotIndex)
      const tcIndex = parseInt(tcIndexStr, 10)
      if (Number.isNaN(tcIndex)) continue
      const tcField = tcDotIndex === -1 ? undefined : tcRest.slice(tcDotIndex + 1)
      if (!tcField) continue

      const toolCalls = msg.tool_calls as Record<string, unknown>[]
      while (toolCalls.length <= tcIndex) toolCalls.push({})
      const tc = toolCalls[tcIndex]!
      if (tcField === "id") tc.id = attrValue
      else if (tcField === "name") tc.name = attrValue
      else if (tcField === "arguments") tc.arguments = attrValue
    }
  }

  const indices = [...messageMap.keys()].sort((a, b) => a - b)
  return indices.map((i) => messageMap.get(i)!)
}

function resolveMessages(attrs: readonly OtlpKeyValue[], prefix: string): Record<string, unknown>[] | undefined {
  // Try JSON string format first
  const jsonRaw = parseJsonString(attrs, prefix)
  if (Array.isArray(jsonRaw) && jsonRaw.length > 0) return jsonRaw

  // Fall back to flattened indexed format
  const indexed = reassembleIndexedMessages(attrs, prefix)
  if (indexed.length > 0) return indexed

  return undefined
}

export function parseGenAIDeprecated(attrs: readonly OtlpKeyValue[]): ParsedContent {
  const promptRaw = resolveMessages(attrs, "gen_ai.prompt")
  const completionRaw = resolveMessages(attrs, "gen_ai.completion")

  let inputMessages: GenAIMessage[] = []
  let systemInstructions: GenAISystem = []

  if (promptRaw && promptRaw.length > 0) {
    const result = safeTranslate(promptRaw, { direction: "input" })
    if (!result.error) {
      inputMessages = result.messages as GenAIMessage[]
      if (result.system) {
        systemInstructions = result.system
      }
    }
  }

  let outputMessages: GenAIMessage[] = []
  if (completionRaw && completionRaw.length > 0) {
    const result = safeTranslate(completionRaw, { direction: "output" })
    if (!result.error) {
      outputMessages = result.messages as GenAIMessage[]
    }
  }

  const functionsRaw = parseJsonString(attrs, "llm.request.functions")
  const toolDefinitions: ToolDefinition[] = Array.isArray(functionsRaw)
    ? (functionsRaw.map(toToolDefinition).filter(Boolean) as ToolDefinition[])
    : []

  return { inputMessages, outputMessages, systemInstructions, toolDefinitions }
}
