/**
 * Content parser for OTEL GenAI semantic convention v1.37+.
 *
 * Attributes:
 *   gen_ai.input.messages  — structured object or JSON string (parts-based GenAI format)
 *   gen_ai.output.messages — same
 *   gen_ai.system_instructions — structured array of parts or JSON string
 *   gen_ai.tool.definitions    — structured array or JSON string
 */
import type { GenAIMessage } from "rosetta-ai"
import type { OtlpAnyValue, OtlpKeyValue } from "../types.ts"
import type { ParsedContent } from "./index.ts"

function anyValueToJs(value: OtlpAnyValue | undefined): unknown {
  if (!value) return undefined
  if (value.stringValue !== undefined) return value.stringValue
  if (value.boolValue !== undefined) return value.boolValue
  if (value.intValue !== undefined) return Number(value.intValue)
  if (value.doubleValue !== undefined) return value.doubleValue
  if (value.arrayValue?.values) return value.arrayValue.values.map(anyValueToJs)
  if (value.kvlistValue?.values) {
    const obj: Record<string, unknown> = {}
    for (const kv of value.kvlistValue.values) {
      obj[kv.key] = anyValueToJs(kv.value)
    }
    return obj
  }
  return undefined
}

function extractJsonAttr(attrs: readonly OtlpKeyValue[], key: string): unknown {
  const kv = attrs.find((a) => a.key === key)
  if (!kv?.value) return undefined
  if (kv.value.stringValue !== undefined) {
    try {
      return JSON.parse(kv.value.stringValue)
    } catch {
      return undefined
    }
  }
  if (kv.value.arrayValue || kv.value.kvlistValue) {
    return anyValueToJs(kv.value)
  }
  return undefined
}

function parseMessages(attrs: readonly OtlpKeyValue[], key: string): GenAIMessage[] {
  const raw = extractJsonAttr(attrs, key)
  if (!Array.isArray(raw)) return []
  return raw as GenAIMessage[]
}

export function parseGenAICurrent(attrs: readonly OtlpKeyValue[]): ParsedContent {
  const inputMessages = parseMessages(attrs, "gen_ai.input.messages")
  const outputMessages = parseMessages(attrs, "gen_ai.output.messages")

  const systemRaw = extractJsonAttr(attrs, "gen_ai.system_instructions")
  const systemInstructions = systemRaw ? JSON.stringify(systemRaw) : ""

  const toolsRaw = extractJsonAttr(attrs, "gen_ai.tool.definitions")
  const toolDefinitions = toolsRaw ? JSON.stringify(toolsRaw) : ""

  return { inputMessages, outputMessages, systemInstructions, toolDefinitions }
}
