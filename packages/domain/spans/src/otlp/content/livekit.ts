/**
 * Content parser for LiveKit Agents telemetry.
 *
 * LiveKit carries model/usage metadata on gen_ai.* attributes but serializes the
 * actual conversation content into custom `lk.*` attributes. OTel attributes are
 * primitives, so every structured value below is a JSON string.
 *
 *   lk.chat_ctx                — ChatContext.to_dict(): { items: ChatItem[] } (LLM input)
 *   lk.response.text           — assistant completion text
 *   lk.response.function_calls — FunctionCall[] the model emitted this turn
 *   lk.function_tools          — available tool schemas
 *
 * ChatItem is discriminated by `type`:
 *   message              — { role, content: (string | { type: "image_content" | "audio_content", ... })[] }
 *   function_call        — { call_id, name, arguments } (assistant tool call)
 *   function_call_output — { call_id, output } (tool result)
 */
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import type { ToolDefinition } from "../../entities/span.ts"
import type { OtlpKeyValue } from "../types.ts"
import type { ParsedContent } from "./index.ts"
import { toToolDefinition } from "./utils.ts"

function rawString(attrs: readonly OtlpKeyValue[], key: string): string | undefined {
  return attrs.find((a) => a.key === key)?.value?.stringValue
}

function rawJson(attrs: readonly OtlpKeyValue[], key: string): unknown {
  const raw = rawString(attrs, key)
  if (raw === undefined) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

type Part = Record<string, unknown>

function contentToParts(content: unknown): Part[] {
  if (typeof content === "string") return content ? [{ type: "text", content }] : []
  if (!Array.isArray(content)) return []

  const parts: Part[] = []
  for (const item of content) {
    if (typeof item === "string") {
      if (item) parts.push({ type: "text", content: item })
      continue
    }
    if (!item || typeof item !== "object") continue

    const obj = item as Record<string, unknown>
    if (obj.type === "image_content") {
      if (typeof obj.image === "string" && obj.image) {
        parts.push({ type: "uri", modality: "image", uri: obj.image })
      }
    } else if (obj.type === "audio_content") {
      if (typeof obj.transcript === "string" && obj.transcript) {
        parts.push({ type: "text", content: obj.transcript })
      }
    } else if (typeof obj.text === "string" && obj.text) {
      parts.push({ type: "text", content: obj.text })
    }
  }
  return parts
}

function isSystemRole(role: unknown): boolean {
  return role === "system" || role === "developer"
}

function parseChatContext(attrs: readonly OtlpKeyValue[]): {
  inputMessages: GenAIMessage[]
  systemInstructions: GenAISystem
} {
  const ctx = rawJson(attrs, "lk.chat_ctx")
  const items = (ctx as { items?: unknown })?.items
  if (!Array.isArray(items)) return { inputMessages: [], systemInstructions: [] }

  const inputMessages: Part[] = []
  const systemInstructions: Part[] = []

  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>

    switch (obj.type) {
      case "message": {
        const parts = contentToParts(obj.content)
        if (parts.length === 0) break
        if (isSystemRole(obj.role)) {
          for (const part of parts) {
            if (part.type === "text") systemInstructions.push(part)
          }
        } else {
          inputMessages.push({ role: obj.role, parts })
        }
        break
      }
      case "function_call":
        inputMessages.push({
          role: "assistant",
          parts: [{ type: "tool_call", id: obj.call_id, name: obj.name, arguments: parseArguments(obj.arguments) }],
        })
        break
      case "function_call_output":
        inputMessages.push({
          role: "tool",
          parts: [{ type: "tool_call_response", id: obj.call_id, response: obj.output }],
        })
        break
    }
  }

  return {
    inputMessages: inputMessages as unknown as GenAIMessage[],
    systemInstructions: systemInstructions as unknown as GenAISystem,
  }
}

function parseOutput(attrs: readonly OtlpKeyValue[]): GenAIMessage[] {
  const parts: Part[] = []

  const text = rawString(attrs, "lk.response.text")
  if (text) parts.push({ type: "text", content: text })

  const calls = rawJson(attrs, "lk.response.function_calls")
  if (Array.isArray(calls)) {
    for (const call of calls) {
      if (!call || typeof call !== "object") continue
      const obj = call as Record<string, unknown>
      parts.push({ type: "tool_call", id: obj.call_id, name: obj.name, arguments: parseArguments(obj.arguments) })
    }
  }

  if (parts.length === 0) return []
  return [{ role: "assistant", parts }] as unknown as GenAIMessage[]
}

function parseToolDefinitions(attrs: readonly OtlpKeyValue[]): ToolDefinition[] {
  const tools = rawJson(attrs, "lk.function_tools")
  if (!Array.isArray(tools)) return []
  return tools.map(toToolDefinition).filter(Boolean) as ToolDefinition[]
}

export function parseLiveKit(attrs: readonly OtlpKeyValue[]): ParsedContent {
  const { inputMessages, systemInstructions } = parseChatContext(attrs)

  return {
    inputMessages,
    outputMessages: parseOutput(attrs),
    systemInstructions,
    toolDefinitions: parseToolDefinitions(attrs),
  }
}
