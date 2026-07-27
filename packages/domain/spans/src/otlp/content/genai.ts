/**
 * Content parser for OTEL GenAI semconv v1.37+ (gen_ai.{input,output}.messages,
 * gen_ai.system_instructions, gen_ai.tool.definitions — structured or JSON string).
 */
import { resolveContentModality } from "@repo/utils"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { Provider, safeTranslate } from "rosetta-ai"
import type { ToolDefinition } from "../../entities/span.ts"
import { anyValueToPlain } from "../any-value.ts"
import type { OtlpKeyValue } from "../types.ts"
import { parseGenAIDeprecated } from "./genai_deprecated.ts"
import type { ParsedContent } from "./index.ts"
import { toToolDefinition } from "./utils.ts"
import { parseVercelOutput } from "./vercel.ts"

function messagesHaveContent(messages: readonly GenAIMessage[]): boolean {
  return messages.some((m) => Array.isArray(m.parts) && m.parts.length > 0)
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
    return anyValueToPlain(kv.value)
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

function normalizePartModality(part: unknown): unknown {
  if (!part || typeof part !== "object") return part
  const p = part as Record<string, unknown>
  if (p.type !== "blob" && p.type !== "uri" && p.type !== "file") return part
  if (typeof p.modality !== "string") return part
  const mime = typeof p.mime_type === "string" ? p.mime_type : null
  const modality = resolveContentModality(p.modality, mime)
  if (modality === p.modality) return part
  return { ...p, modality }
}

function normalizeMessagePartModalities(msg: unknown): unknown {
  if (!msg || typeof msg !== "object") return msg
  const m = msg as Record<string, unknown>
  if (!Array.isArray(m.parts)) return msg
  return { ...m, parts: m.parts.map(normalizePartModality) }
}

function normalizeMessagesModalities(messages: readonly GenAIMessage[]): GenAIMessage[] {
  return messages.map((msg) => normalizeMessagePartModalities(msg) as GenAIMessage)
}

function parseMessages(attrs: readonly OtlpKeyValue[], key: string): GenAIMessage[] {
  const raw = extractJsonAttr(attrs, key)
  if (!Array.isArray(raw)) return []
  return hoistToolResults(raw.map(normalizeSemconvMessage) as GenAIMessage[])
}

// Cloudflare AI Gateway sends the raw request body under gen_ai.input.messages
// (`{messages:[...], ...}`), or under gen_ai.prompt_json in its documented OTEL export; pull the
// messages array and translate as OpenAI-compatible input.
function parseCloudflareInput(attrs: readonly OtlpKeyValue[]): GenAIMessage[] {
  const raw = extractJsonAttr(attrs, "gen_ai.input.messages") ?? extractJsonAttr(attrs, "gen_ai.prompt_json")
  const messages = Array.isArray(raw) ? raw : (raw as { messages?: unknown } | undefined)?.messages
  if (!Array.isArray(messages)) return []
  const result = safeTranslate(messages as object[], { from: Provider.OpenAICompletions, direction: "input" })
  return result.error ? [] : (result.messages as GenAIMessage[])
}

// Cloudflare AI Gateway sends the upstream provider's native response under
// gen_ai.output.messages (or gen_ai.completion_json in its documented OTEL export), optionally
// wrapped in `{state, result}`. Dispatch on the response shape: `choices` → OpenAI-compatible,
// `content[]`+role → Anthropic, embeddings/unknown → none.
function parseCloudflareOutput(attrs: readonly OtlpKeyValue[]): GenAIMessage[] {
  const raw = extractJsonAttr(attrs, "gen_ai.output.messages") ?? extractJsonAttr(attrs, "gen_ai.completion_json")
  if (!raw || typeof raw !== "object") return []
  const body = raw as Record<string, unknown>
  const obj = (body.result && typeof body.result === "object" ? body.result : body) as Record<string, unknown>

  if (Array.isArray(obj.choices)) {
    const messages = (obj.choices as Record<string, unknown>[]).map((c) => c?.message).filter(Boolean)
    const result = safeTranslate(messages as object[], { from: Provider.OpenAICompletions, direction: "output" })
    return result.error ? [] : (result.messages as GenAIMessage[])
  }
  if (Array.isArray(obj.content) && typeof obj.role === "string") {
    const result = safeTranslate([obj] as object[], { from: Provider.Anthropic, direction: "output" })
    return result.error ? [] : (result.messages as GenAIMessage[])
  }
  return []
}

/** Attribute keys this parser reads. Consumed by `isContentAttributeKey` so ingest redaction can drop the raw copies. */
export const GENAI_CONTENT_ATTRIBUTE_KEYS = {
  exact: [
    "gen_ai.input.messages",
    "gen_ai.output.messages",
    "gen_ai.system_instructions",
    "gen_ai.tool.definitions",
    "gen_ai.prompt_json",
    "gen_ai.completion_json",
  ],
  prefixes: [],
} as const

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

  // Vercel AI SDK v6's GenAI compat layer emits gen_ai.input.messages but keeps the
  // model's turn only in ai.response.* (no gen_ai.output.messages). This parser wins
  // dispatch on the input key, so recover the output from the Vercel attributes.
  if (!messagesHaveContent(outputMessages)) {
    const vercelOutput = parseVercelOutput(attrs)
    if (vercelOutput.length > 0) outputMessages = [...vercelOutput]
  }

  // Cloudflare AI Gateway reuses the standard keys but with non-standard values (request-body
  // envelope for input, upstream provider response for output), so the array parser above
  // yields nothing. Recover them by shape.
  if (!messagesHaveContent(inputMessages)) {
    const cf = parseCloudflareInput(attrs)
    if (cf.length > 0) inputMessages = cf
  }
  if (!messagesHaveContent(outputMessages)) {
    const cf = parseCloudflareOutput(attrs)
    if (cf.length > 0) outputMessages = cf
  }

  // Reconcile inline role:"system" turns with any separated gen_ai.system_instructions into
  // systemInstructions (rosetta keeps mid-conversation system inline).
  if (inputMessages.length > 0) {
    const result = safeTranslate(inputMessages, {
      from: Provider.GenAI,
      direction: "input",
      system: systemInstructions,
    })
    if (!result.error) {
      inputMessages = result.messages as GenAIMessage[]
      systemInstructions = (result.system ?? []) as GenAISystem
    }
  }
  if (outputMessages.length > 0) {
    const result = safeTranslate(outputMessages, { from: Provider.GenAI, direction: "output" })
    if (!result.error) outputMessages = result.messages as GenAIMessage[]
  }

  return {
    inputMessages: normalizeMessagesModalities(inputMessages),
    outputMessages: normalizeMessagesModalities(outputMessages),
    systemInstructions,
    toolDefinitions,
  }
}
