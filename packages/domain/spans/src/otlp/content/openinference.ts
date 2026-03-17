/**
 * Content parser for OpenInference (Arize Phoenix).
 *
 * OpenInference explodes messages into flattened indexed span attributes:
 *   llm.input_messages.{i}.message.role
 *   llm.input_messages.{i}.message.content
 *   llm.input_messages.{i}.message.tool_calls.{j}.tool_call.function.name
 *   llm.input_messages.{i}.message.tool_calls.{j}.tool_call.function.arguments
 *   llm.input_messages.{i}.message.contents.{j}.message_content.type
 *   llm.input_messages.{i}.message.contents.{j}.message_content.text
 *   llm.input_messages.{i}.message.contents.{j}.message_content.image.image.url
 *
 * Output messages follow the same pattern with llm.output_messages.{i}.
 *
 * Tool definitions use:
 *   llm.tools.{i}.tool.json_schema — JSON string of tool schema
 *
 * We reassemble these into message arrays, then translate via rosetta-ai.
 */
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { safeTranslate } from "rosetta-ai"
import type { ToolDefinition } from "../../entities/span.ts"
import type { OtlpKeyValue } from "../types.ts"
import type { ParsedContent } from "./index.ts"
import { toToolDefinition } from "./utils.ts"

interface ToolCallData {
  name: string
  arguments: string
}

interface ContentPartData {
  type: string
  text?: string
  imageUrl?: string
}

type MessageContent = string | { type: string; text?: string; image_url?: { url: string } }[]

interface ReassembledMessage {
  role: string
  content: MessageContent
  tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[]
}

const INPUT_PREFIX = "llm.input_messages."
const OUTPUT_PREFIX = "llm.output_messages."
const TOOLS_PREFIX = "llm.tools."

/** Splits "0.message.role" into { index: 0, field: "message.role" }. */
function parseIndexedField(rest: string): { index: number; field: string } | null {
  const dotIdx = rest.indexOf(".")
  if (dotIdx === -1) return null
  const index = Number.parseInt(rest.slice(0, dotIdx), 10)
  if (Number.isNaN(index)) return null
  return { index, field: rest.slice(dotIdx + 1) }
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let value = map.get(key)
  if (!value) {
    value = create()
    map.set(key, value)
  }
  return value
}

/** Routes a `message.tool_calls.{j}.*` attribute into the tool-call accumulator. */
function collectToolCallField(
  toolCalls: Map<number, Map<number, ToolCallData>>,
  msgIndex: number,
  field: string,
  value: string,
): void {
  const parsed = parseIndexedField(field.slice("message.tool_calls.".length))
  if (!parsed) return

  const msgToolCalls = getOrCreate(toolCalls, msgIndex, () => new Map())
  const tc = getOrCreate(msgToolCalls, parsed.index, () => ({ name: "", arguments: "" }))

  if (parsed.field === "tool_call.function.name") tc.name = value
  else if (parsed.field === "tool_call.function.arguments") tc.arguments = value
}

/** Routes a `message.contents.{j}.*` attribute into the content-part accumulator. */
function collectContentPartField(
  contentParts: Map<number, Map<number, ContentPartData>>,
  msgIndex: number,
  field: string,
  value: string,
): void {
  const parsed = parseIndexedField(field.slice("message.contents.".length))
  if (!parsed) return

  const msgParts = getOrCreate(contentParts, msgIndex, () => new Map())
  const part = getOrCreate(msgParts, parsed.index, () => ({ type: "text" }))

  if (parsed.field === "message_content.type") part.type = value
  else if (parsed.field === "message_content.text") part.text = value
  else if (parsed.field === "message_content.image.image.url") part.imageUrl = value
}

/** Resolves content for a single message: multipart array if parts exist, otherwise plain string. */
function buildMessageContent(
  parts: Map<number, ContentPartData> | undefined,
  plainContent: string | undefined,
): MessageContent {
  if (parts && parts.size > 0) {
    const sorted = [...parts.entries()].sort(([a], [b]) => a - b)
    return sorted.map(([, part]) => {
      if (part.type === "image" && part.imageUrl) {
        return { type: "image_url" as const, image_url: { url: part.imageUrl } }
      }
      return { type: "text" as const, text: part.text ?? "" }
    })
  }
  return plainContent ?? ""
}

/** Builds an ordered array of ReassembledMessages from the three collected maps (fields, tool calls, content parts). */
function assembleMessages(
  fields: Map<number, Map<string, string>>,
  toolCalls: Map<number, Map<number, ToolCallData>>,
  contentParts: Map<number, Map<number, ContentPartData>>,
): ReassembledMessage[] {
  const maxIndex = Math.max(...fields.keys(), ...toolCalls.keys(), ...contentParts.keys(), -1)
  if (maxIndex === -1) return []

  const messages: ReassembledMessage[] = []
  for (let i = 0; i <= maxIndex; i++) {
    const msgFields = fields.get(i)
    const role = msgFields?.get("role") ?? "user"
    const content = buildMessageContent(contentParts.get(i), msgFields?.get("content"))
    const msg: ReassembledMessage = { role, content }

    const msgToolCalls = toolCalls.get(i)
    if (msgToolCalls && msgToolCalls.size > 0) {
      const sorted = [...msgToolCalls.entries()].sort(([a], [b]) => a - b)
      msg.tool_calls = sorted.map(([j, tc]) => ({
        id: `call_${i}_${j}`,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      }))
    }

    messages.push(msg)
  }

  return messages
}

/** Scans flat OTLP attributes with the given prefix and reconstructs them into an ordered message array. */
function reassembleMessages(attrs: readonly OtlpKeyValue[], prefix: string): ReassembledMessage[] {
  const fields = new Map<number, Map<string, string>>()
  const toolCalls = new Map<number, Map<number, ToolCallData>>()
  const contentParts = new Map<number, Map<number, ContentPartData>>()

  for (const attr of attrs) {
    if (!attr.key.startsWith(prefix)) continue
    const rest = attr.key.slice(prefix.length)

    const parsed = parseIndexedField(rest)
    if (!parsed) continue

    const value = attr.value?.stringValue ?? ""

    if (parsed.field.startsWith("message.tool_calls.")) {
      collectToolCallField(toolCalls, parsed.index, parsed.field, value)
    } else if (parsed.field.startsWith("message.contents.")) {
      collectContentPartField(contentParts, parsed.index, parsed.field, value)
    } else if (parsed.field.startsWith("message.")) {
      const msgField = parsed.field.slice("message.".length)
      getOrCreate(fields, parsed.index, () => new Map()).set(msgField, value)
    }
  }

  return assembleMessages(fields, toolCalls, contentParts)
}

/** Collects `llm.tools.{i}.tool.json_schema` attributes into ToolDefinition[]. */
function reassembleToolDefinitions(attrs: readonly OtlpKeyValue[]): ToolDefinition[] {
  const tools = new Map<number, string>()

  for (const attr of attrs) {
    if (!attr.key.startsWith(TOOLS_PREFIX)) continue
    const rest = attr.key.slice(TOOLS_PREFIX.length)
    const parsed = parseIndexedField(rest)
    if (!parsed) continue
    if (parsed.field === "tool.json_schema" && attr.value?.stringValue) {
      tools.set(parsed.index, attr.value.stringValue)
    }
  }

  if (tools.size === 0) return []

  const sorted = [...tools.entries()].sort(([a], [b]) => a - b)
  return sorted
    .map(([, json]) => {
      try {
        return toToolDefinition(JSON.parse(json))
      } catch {
        return undefined
      }
    })
    .filter(Boolean) as ToolDefinition[]
}

/** Translates reassembled OpenInference messages into GenAI format via rosetta-ai. */
function translateReassembled(messages: ReassembledMessage[], direction: "input" | "output"): GenAIMessage[] {
  if (messages.length === 0) return []
  const result = safeTranslate(messages, { direction })
  if (result.error) return []
  return result.messages as GenAIMessage[]
}

export function parseOpenInference(attrs: readonly OtlpKeyValue[]): ParsedContent {
  const inputRaw = reassembleMessages(attrs, INPUT_PREFIX)
  const outputRaw = reassembleMessages(attrs, OUTPUT_PREFIX)

  let inputMessages: GenAIMessage[] = []
  let systemInstructions: GenAISystem = []

  if (inputRaw.length > 0) {
    const result = safeTranslate(inputRaw, { direction: "input" })
    if (!result.error) {
      inputMessages = result.messages as GenAIMessage[]
      if (result.system) {
        systemInstructions = result.system
      }
    }
  }

  const outputMessages = translateReassembled(outputRaw, "output")
  const toolDefinitions = reassembleToolDefinitions(attrs)

  return { inputMessages, outputMessages, systemInstructions, toolDefinitions }
}
