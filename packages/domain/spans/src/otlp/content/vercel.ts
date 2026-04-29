/**
 * Content parser for Vercel AI SDK telemetry.
 *
 * Top-level spans:
 *   ai.prompt           — JSON object with { system?: string, messages: [...] }
 *   ai.response.text    — plain text string (assistant output)
 *   ai.response.object  — JSON string of a structured object (generateObject output)
 *   ai.response.toolCalls — JSON string of tool call objects
 *
 * Call-level spans:
 *   ai.prompt.messages  — JSON string array of messages
 *   ai.prompt.tools     — string[] (each element is a JSON string of a tool definition)
 *
 * We translate messages via rosetta-ai with from: Provider.VercelAI.
 */
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { Provider, safeTranslate } from "rosetta-ai"
import type { ToolDefinition } from "../../entities/span.ts"
import type { OtlpKeyValue } from "../types.ts"
import type { ParsedContent } from "./index.ts"
import { toToolDefinition } from "./utils.ts"

function rawStringAttr(attrs: readonly OtlpKeyValue[], key: string): string | undefined {
  const kv = attrs.find((a) => a.key === key)
  return kv?.value?.stringValue
}

function parseJsonSafe(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return undefined
  }
}

function parseInputFromTopLevel(attrs: readonly OtlpKeyValue[]): {
  messages: GenAIMessage[]
  system: GenAISystem
} {
  const promptJson = rawStringAttr(attrs, "ai.prompt")
  if (!promptJson) return { messages: [], system: [] }

  const prompt = parseJsonSafe(promptJson)
  if (!prompt || typeof prompt !== "object") return { messages: [], system: [] }

  const {
    system,
    messages,
    prompt: singlePrompt,
  } = prompt as {
    system?: string
    messages?: unknown[]
    prompt?: string
  }

  let translatedMessages: GenAIMessage[] = []
  if (Array.isArray(messages) && messages.length > 0) {
    const result = safeTranslate(messages as object[], { from: Provider.VercelAI, direction: "input" })
    if (!result.error) {
      translatedMessages = result.messages as GenAIMessage[]
    }
  } else if (typeof singlePrompt === "string" && singlePrompt) {
    const result = safeTranslate([{ role: "user", content: singlePrompt }], {
      from: Provider.VercelAI,
      direction: "input",
    })
    if (!result.error) {
      translatedMessages = result.messages as GenAIMessage[]
    }
  }

  const systemInstructions: GenAISystem =
    typeof system === "string" && system ? [{ type: "text", content: system }] : []

  return { messages: translatedMessages, system: systemInstructions }
}

function parseInputFromCallLevel(attrs: readonly OtlpKeyValue[]): {
  messages: GenAIMessage[]
  system: GenAISystem
} {
  const messagesJson = rawStringAttr(attrs, "ai.prompt.messages")
  if (!messagesJson) return { messages: [], system: [] }

  const raw = parseJsonSafe(messagesJson)
  if (!Array.isArray(raw) || raw.length === 0) return { messages: [], system: [] }

  const result = safeTranslate(raw, { from: Provider.VercelAI, direction: "input" })
  if (result.error) return { messages: [], system: [] }

  return { messages: result.messages as GenAIMessage[], system: result.system ?? [] }
}

function parseOutput(attrs: readonly OtlpKeyValue[]): GenAIMessage[] {
  const text = rawStringAttr(attrs, "ai.response.text")
  const objectJson = rawStringAttr(attrs, "ai.response.object")
  const toolCallsJson = rawStringAttr(attrs, "ai.response.toolCalls")

  const contentParts: object[] = []
  if (text) contentParts.push({ type: "text", text })
  else if (objectJson) contentParts.push({ type: "text", text: objectJson })
  if (toolCallsJson) {
    const toolCalls = parseJsonSafe(toolCallsJson)
    if (Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        contentParts.push({ type: "tool-call", toolCallId: tc.toolCallId, toolName: tc.toolName, args: tc.input })
      }
    }
  }

  if (contentParts.length === 0) return []

  const messages = [{ role: "assistant" as const, content: contentParts }]
  const result = safeTranslate(messages, { from: Provider.VercelAI, direction: "output" })
  if (result.error) return []
  return result.messages as GenAIMessage[]
}

function parseToolDefinitions(attrs: readonly OtlpKeyValue[]): ToolDefinition[] {
  const kv = attrs.find((a) => a.key === "ai.prompt.tools")
  if (!kv?.value?.arrayValue?.values) return []

  return kv.value.arrayValue.values
    .map((v) => {
      if (!v.stringValue) return undefined
      const parsed = parseJsonSafe(v.stringValue)
      return parsed ? toToolDefinition(parsed) : undefined
    })
    .filter(Boolean) as ToolDefinition[]
}

export function parseVercel(attrs: readonly OtlpKeyValue[]): ParsedContent {
  // Try top-level first, fall back to call-level
  let input = parseInputFromTopLevel(attrs)
  if (input.messages.length === 0) {
    input = parseInputFromCallLevel(attrs)
  }

  const outputMessages = parseOutput(attrs)
  const toolDefinitions = parseToolDefinitions(attrs)

  return {
    inputMessages: input.messages,
    outputMessages,
    systemInstructions: input.system,
    toolDefinitions,
  }
}
