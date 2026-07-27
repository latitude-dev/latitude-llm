/**
 * Content parser for Flue telemetry (@flue/opentelemetry).
 *
 * Flue carries model/usage metadata on gen_ai.* attributes but serializes the
 * model turn's conversation into custom flue.turn.* attributes. OTel attributes
 * are primitives, so every structured value below is a JSON string.
 *
 *   flue.turn.input  — { systemPrompt?: string, messages: LlmMessage[], tools?: LlmTool[] }
 *   flue.turn.output — LlmAssistantMessage ({ role: "assistant", content: [...] })
 *
 * LlmMessage is discriminated by `role`:
 *   user        — { role: "user", content: string | (text | image)[] }
 *   assistant   — { role: "assistant", content: (text | thinking | toolCall)[] }
 *   toolResult  — { role: "toolResult", toolCallId, toolName, content: (text | image)[], isError }
 *
 * Content blocks are discriminated by `type`:
 *   text     — { type: "text", text }
 *   thinking — { type: "thinking", thinking }
 *   image    — { type: "image", data (base64), mimeType }
 *   toolCall — { type: "toolCall", id, name, arguments }
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

type Part = Record<string, unknown>

function blockToPart(block: unknown): Part | undefined {
  if (!block || typeof block !== "object") return undefined
  const obj = block as Record<string, unknown>

  switch (obj.type) {
    case "text":
      return typeof obj.text === "string" && obj.text ? { type: "text", content: obj.text } : undefined
    case "thinking":
      return typeof obj.thinking === "string" && obj.thinking ? { type: "reasoning", content: obj.thinking } : undefined
    case "image":
      return typeof obj.data === "string" && obj.data
        ? {
            type: "uri",
            modality: "image",
            uri: `data:${obj.mimeType ?? "application/octet-stream"};base64,${obj.data}`,
          }
        : undefined
    case "toolCall":
      return { type: "tool_call", id: obj.id, name: obj.name, arguments: obj.arguments }
    default:
      return undefined
  }
}

function contentToParts(content: unknown): Part[] {
  if (typeof content === "string") return content ? [{ type: "text", content }] : []
  if (!Array.isArray(content)) return []
  return content.map(blockToPart).filter(Boolean) as Part[]
}

function toolResultResponse(content: unknown): unknown {
  if (!Array.isArray(content)) return content
  const text = content
    .filter(
      (b): b is { text: string } => !!b && typeof b === "object" && typeof (b as { text?: unknown }).text === "string",
    )
    .map((b) => b.text)
    .join("\n")
  return text || content
}

function messageToGenAI(message: unknown): GenAIMessage | undefined {
  if (!message || typeof message !== "object") return undefined
  const obj = message as Record<string, unknown>

  if (obj.role === "toolResult") {
    return {
      role: "tool",
      parts: [{ type: "tool_call_response", id: obj.toolCallId, response: toolResultResponse(obj.content) }],
    } as unknown as GenAIMessage
  }

  if (obj.role === "user" || obj.role === "assistant") {
    const parts = contentToParts(obj.content)
    if (parts.length === 0) return undefined
    return { role: obj.role, parts } as unknown as GenAIMessage
  }

  return undefined
}

function parseInput(attrs: readonly OtlpKeyValue[]): {
  inputMessages: GenAIMessage[]
  systemInstructions: GenAISystem
  toolDefinitions: ToolDefinition[]
} {
  const input = rawJson(attrs, "flue.turn.input") as
    | { systemPrompt?: unknown; messages?: unknown; tools?: unknown }
    | undefined
  if (!input || typeof input !== "object") {
    return { inputMessages: [], systemInstructions: [], toolDefinitions: [] }
  }

  const systemInstructions: GenAISystem =
    typeof input.systemPrompt === "string" && input.systemPrompt
      ? ([{ type: "text", content: input.systemPrompt }] as unknown as GenAISystem)
      : []

  const inputMessages = Array.isArray(input.messages)
    ? (input.messages.map(messageToGenAI).filter(Boolean) as GenAIMessage[])
    : []

  const toolDefinitions = Array.isArray(input.tools)
    ? (input.tools.map(toToolDefinition).filter(Boolean) as ToolDefinition[])
    : []

  return { inputMessages, systemInstructions, toolDefinitions }
}

function parseOutput(attrs: readonly OtlpKeyValue[]): GenAIMessage[] {
  const output = rawJson(attrs, "flue.turn.output")
  const message = messageToGenAI(output)
  return message ? [message] : []
}

/** Keys this parser reads, composed into `isContentAttributeKey`. */
export const FLUE_CONTENT_ATTRIBUTE_KEYS = {
  exact: ["flue.turn.input", "flue.turn.output"],
  prefixes: [],
} as const

export function parseFlue(attrs: readonly OtlpKeyValue[]): ParsedContent {
  const { inputMessages, systemInstructions, toolDefinitions } = parseInput(attrs)

  return {
    inputMessages,
    outputMessages: parseOutput(attrs),
    systemInstructions,
    toolDefinitions,
  }
}
