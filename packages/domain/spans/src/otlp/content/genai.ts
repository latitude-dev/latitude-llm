/**
 * Content parser for OTEL GenAI semconv v1.37+ (gen_ai.{input,output}.messages,
 * gen_ai.system_instructions, gen_ai.tool.definitions — structured or JSON string).
 */
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import type { ToolDefinition } from "../../entities/span.ts"
import type { OtlpAnyValue, OtlpKeyValue } from "../types.ts"
import { parseGenAIDeprecated } from "./genai_deprecated.ts"
import type { ParsedContent } from "./index.ts"
import { toToolDefinition } from "./utils.ts"

function messagesHaveContent(messages: readonly GenAIMessage[]): boolean {
  return messages.some((m) => Array.isArray(m.parts) && m.parts.length > 0)
}

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

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

interface RawPart {
  type?: string
  content?: unknown
}

// litellm wraps history in the GenAI `{role, parts}` envelope but keeps OpenAI-native
// fields: an assistant turn carries a `tool_calls` array (empty `parts`), a tool result a
// top-level `tool_call_id`. Rewrite both into `tool_call` / `tool_call_response` parts.
function normalizeSemconvMessage(msg: unknown): unknown {
  if (!msg || typeof msg !== "object") return msg
  const m = msg as Record<string, unknown>
  const parts: RawPart[] = Array.isArray(m.parts) ? [...(m.parts as RawPart[])] : []
  let changed = false

  if (Array.isArray(m.tool_calls) && !parts.some((p) => p?.type === "tool_call")) {
    for (const tc of m.tool_calls as Record<string, unknown>[]) {
      const fn = (tc?.function as Record<string, unknown>) ?? {}
      parts.push({
        type: "tool_call",
        id: (tc?.id as string | null) ?? null,
        name: fn.name,
        arguments: parseMaybeJson(fn.arguments),
      } as RawPart)
    }
    changed = true
  }

  if (typeof m.tool_call_id === "string" && !parts.some((p) => p?.type === "tool_call_response")) {
    const text = parts
      .filter((p) => p?.type === "text")
      .map((p) => p.content)
      .join("")
    const rest = parts.filter((p) => p?.type !== "text")
    rest.push({ type: "tool_call_response", id: m.tool_call_id, response: parseMaybeJson(text) } as RawPart)
    parts.length = 0
    parts.push(...rest)
    changed = true
  }

  if (!changed) return msg
  const { tool_calls, tool_call_id, ...kept } = m
  return { ...kept, parts }
}

// Hoist tool_call_response parts into their own "tool" message (downstream pairing keys off
// role === "tool"); some providers (Anthropic) nest tool results in a "user" turn.
function hoistToolResults(messages: readonly GenAIMessage[]): GenAIMessage[] {
  const out: GenAIMessage[] = []
  for (const msg of messages) {
    const parts = Array.isArray(msg.parts) ? msg.parts : []
    if (msg.role === "tool" || !parts.some((p) => (p as RawPart)?.type === "tool_call_response")) {
      out.push(msg)
      continue
    }
    const toolParts = parts.filter((p) => (p as RawPart)?.type === "tool_call_response")
    const otherParts = parts.filter((p) => (p as RawPart)?.type !== "tool_call_response")
    out.push({ role: "tool", parts: toolParts } as GenAIMessage)
    if (otherParts.length > 0) out.push({ ...msg, parts: otherParts })
  }
  return out
}

function parseMessages(attrs: readonly OtlpKeyValue[], key: string): GenAIMessage[] {
  const raw = extractJsonAttr(attrs, key)
  if (!Array.isArray(raw)) return []
  return hoistToolResults(raw.map(normalizeSemconvMessage) as GenAIMessage[])
}

export function parseGenAICurrent(attrs: readonly OtlpKeyValue[]): ParsedContent {
  let inputMessages = parseMessages(attrs, "gen_ai.input.messages")
  let outputMessages = parseMessages(attrs, "gen_ai.output.messages")

  const systemRaw = extractJsonAttr(attrs, "gen_ai.system_instructions")
  let systemInstructions: GenAISystem = Array.isArray(systemRaw) ? (systemRaw as GenAISystem) : []

  const toolsRaw = extractJsonAttr(attrs, "gen_ai.tool.definitions")
  let toolDefinitions: ToolDefinition[] = Array.isArray(toolsRaw)
    ? (toolsRaw.map(toToolDefinition).filter(Boolean) as ToolDefinition[])
    : []

  // litellm and some gen_ai emitters leave gen_ai.{input,output}.messages contentless and
  // keep the real data in the deprecated split attributes; recover whatever's empty.
  if (!messagesHaveContent(inputMessages) || !messagesHaveContent(outputMessages) || toolDefinitions.length === 0) {
    const deprecated = parseGenAIDeprecated(attrs)
    if (!messagesHaveContent(inputMessages) && deprecated.inputMessages.length > 0) {
      inputMessages = [...deprecated.inputMessages]
      if (systemInstructions.length === 0 && deprecated.systemInstructions.length > 0) {
        systemInstructions = deprecated.systemInstructions
      }
    }
    if (!messagesHaveContent(outputMessages) && deprecated.outputMessages.length > 0) {
      outputMessages = [...deprecated.outputMessages]
    }
    if (toolDefinitions.length === 0 && deprecated.toolDefinitions.length > 0) {
      toolDefinitions = [...deprecated.toolDefinitions]
    }
  }

  return { inputMessages, outputMessages, systemInstructions, toolDefinitions }
}
