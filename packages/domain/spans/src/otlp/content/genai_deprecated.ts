/**
 * Content parser for the deprecated/OpenLLMetry GenAI form. Handles both the JSON-string
 * shape (gen_ai.prompt / gen_ai.completion = JSON array of {role, content}) and the
 * flattened indexed shape (gen_ai.{prompt,completion}.{i}.{role,content,tool_calls.*,
 * function_call.*}). Tool definitions come from llm.request.functions (JSON array or
 * indexed llm.request.functions.{i}.*).
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

// LangChain (OpenLLMetry) uses framework-native role names; rosetta passes unknown roles
// through, so normalize the well-known aliases first.
const ROLE_ALIASES: Record<string, string> = {
  ai: "assistant",
  human: "user",
}

function aliasRole(role: unknown): unknown {
  return typeof role === "string" ? (ROLE_ALIASES[role.toLowerCase()] ?? role) : role
}

// Some instrumentors serialize content as a *stringified* parts array
// (`'[{"type":"text","text":"…"}]'`); left as a string rosetta double-encodes it. Parse it
// back so rosetta translates each part.
function unwrapContentParts(raw: string): unknown {
  if (!raw.trimStart().startsWith("[")) return raw
  try {
    const parsed = JSON.parse(raw)
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((p) => p !== null && typeof p === "object" && typeof (p as { type?: unknown }).type === "string")
    ) {
      return parsed
    }
  } catch {
    // Not JSON — keep the literal string content.
  }
  return raw
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
    const msg = messageMap.get(index)
    if (!msg) continue

    const attrValue = value?.stringValue ?? value?.intValue?.toString() ?? value?.boolValue?.toString()
    if (attrValue === undefined) continue

    if (field === "role") {
      msg.role = attrValue
    } else if (field === "content") {
      msg.content = unwrapContentParts(attrValue)
    } else if (field === "tool_call_id") {
      msg.tool_call_id = attrValue
    } else if (field === "tool_name") {
      msg.tool_name = attrValue
    } else if (field === "tool_result") {
      msg.tool_result = attrValue
    } else if (field === "function_call.name" || field === "function_call.arguments") {
      // Legacy single-call shape; rosetta turns a message-level `function_call` into a tool_call part.
      const fc = (msg.function_call as Record<string, unknown> | undefined) ?? {}
      if (field === "function_call.name") fc.name = attrValue
      else fc.arguments = attrValue
      msg.function_call = fc
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
      const tc = toolCalls[tcIndex]
      if (typeof tc !== "object" || !tc) continue
      // rosetta only recognizes the OpenAI-nested tool-call shape; flat indexed fields must be assembled into it.
      if (tcField === "id") {
        tc.id = attrValue
      } else if (tcField === "name" || tcField === "arguments") {
        tc.type = "function"
        const fn = (tc.function as Record<string, unknown> | undefined) ?? {}
        if (tcField === "name") fn.name = attrValue
        else fn.arguments = attrValue
        tc.function = fn
      }
    }
  }

  const indices = [...messageMap.keys()].sort((a, b) => a - b)
  return indices.flatMap((i) => {
    const msg = messageMap.get(i)
    return msg ? [msg] : []
  })
}

/**
 * Reassemble flattened indexed tool/function definitions.
 * e.g. llm.request.functions.0.name/description/parameters → [{name, description, parameters}]
 */
function reassembleIndexedFunctions(attrs: readonly OtlpKeyValue[]): Record<string, unknown>[] {
  const prefix = "llm.request.functions"
  const fnMap = new Map<number, Record<string, unknown>>()

  for (const { key, value } of attrs) {
    if (!key.startsWith(`${prefix}.`)) continue

    const rest = key.slice(prefix.length + 1)
    const dotIndex = rest.indexOf(".")
    if (dotIndex === -1) continue
    const index = parseInt(rest.slice(0, dotIndex), 10)
    if (Number.isNaN(index)) continue

    const field = rest.slice(dotIndex + 1)
    const raw = value?.stringValue
    if (raw === undefined) continue

    if (!fnMap.has(index)) fnMap.set(index, {})
    const fn = fnMap.get(index)
    if (!fn) continue

    if (field === "name") fn.name = raw
    else if (field === "description") fn.description = raw
    else if (field === "parameters") {
      try {
        fn.parameters = JSON.parse(raw)
      } catch {
        fn.parameters = raw
      }
    }
  }

  const indices = [...fnMap.keys()].sort((a, b) => a - b)
  return indices.flatMap((i) => {
    const fn = fnMap.get(i)
    return fn ? [fn] : []
  })
}

function resolveToolDefinitions(attrs: readonly OtlpKeyValue[]): ToolDefinition[] {
  const jsonRaw = parseJsonString(attrs, "llm.request.functions")
  const raw = Array.isArray(jsonRaw) && jsonRaw.length > 0 ? jsonRaw : reassembleIndexedFunctions(attrs)
  return raw.map(toToolDefinition).filter(Boolean) as ToolDefinition[]
}

// Rosetta only renders a tool_call that carries an `id`, and joins a tool result to its call by
// matching `tool_call_id`. Deprecated emitters (e.g. Traceloop) often omit both, so mint a per-message
// id for id-less tool_calls and back-fill the matching tool result — mirroring the OpenInference parser.
// Without this, rosetta drops the tool_calls into `_provider_metadata` and the call never surfaces.
function linkToolCalls(messages: Record<string, unknown>[]): void {
  const pending: { id: string; name: string | undefined }[] = []
  messages.forEach((msg, i) => {
    const toolCalls = msg.tool_calls
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      // tool_calls supersede the legacy single `function_call`; drop it so rosetta doesn't double-count.
      delete msg.function_call
      toolCalls.forEach((raw, j) => {
        const tc = raw as Record<string, unknown>
        if (!tc.id) tc.id = `call_${i}_${j}`
        const fn = tc.function as Record<string, unknown> | undefined
        pending.push({ id: tc.id as string, name: typeof fn?.name === "string" ? fn.name : undefined })
      })
    }
    if (msg.role === "tool" && msg.tool_call_id == null && pending.length > 0) {
      const toolName = typeof msg.tool_name === "string" ? msg.tool_name : undefined
      let idx = toolName ? pending.findIndex((p) => p.name === toolName) : -1
      if (idx === -1) idx = 0
      const match = pending[idx]
      if (match) {
        msg.tool_call_id = match.id
        pending.splice(idx, 1)
      }
    }
  })
}

function resolveMessages(attrs: readonly OtlpKeyValue[], prefix: string): Record<string, unknown>[] | undefined {
  // Try JSON string format first, then the flattened indexed format.
  const jsonRaw = parseJsonString(attrs, prefix)
  const messages =
    Array.isArray(jsonRaw) && jsonRaw.length > 0
      ? (jsonRaw as Record<string, unknown>[])
      : reassembleIndexedMessages(attrs, prefix)
  if (messages.length === 0) return undefined

  // Normalize role aliases across both formats.
  for (const msg of messages) {
    if (msg && typeof msg === "object" && "role" in msg) msg.role = aliasRole(msg.role)
  }
  linkToolCalls(messages)
  return messages
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
    // The model's turn: a missing/empty role defaults to `assistant` (rosetta would default
    // to `user`); recognized aliases already applied, other roles kept as-is.
    for (const msg of completionRaw) {
      if (typeof msg.role !== "string" || msg.role === "") msg.role = "assistant"
    }
    const result = safeTranslate(completionRaw, { direction: "output" })
    if (!result.error) {
      outputMessages = result.messages as GenAIMessage[]
    }
  }

  const toolDefinitions = resolveToolDefinitions(attrs)

  return { inputMessages, outputMessages, systemInstructions, toolDefinitions }
}
