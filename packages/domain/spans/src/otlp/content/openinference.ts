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
import type { GenAIMessage } from "rosetta-ai"
import { safeTranslate } from "rosetta-ai"
import type { OtlpKeyValue } from "../types.ts"
import type { ParsedContent } from "./index.ts"

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

function reassembleMessages(attrs: readonly OtlpKeyValue[], prefix: string): ReassembledMessage[] {
  const byIndex = new Map<number, Map<string, string>>()
  const toolCalls = new Map<number, Map<number, ToolCallData>>()
  const contentParts = new Map<number, Map<number, ContentPartData>>()

  for (const attr of attrs) {
    if (!attr.key.startsWith(prefix)) continue
    const rest = attr.key.slice(prefix.length)

    const dotIdx = rest.indexOf(".")
    if (dotIdx === -1) continue

    const index = Number.parseInt(rest.slice(0, dotIdx), 10)
    if (Number.isNaN(index)) continue

    const field = rest.slice(dotIdx + 1)
    const value = attr.value?.stringValue ?? ""

    if (field.startsWith("message.tool_calls.")) {
      const tcRest = field.slice("message.tool_calls.".length)
      const tcDotIdx = tcRest.indexOf(".")
      if (tcDotIdx === -1) continue
      const tcIndex = Number.parseInt(tcRest.slice(0, tcDotIdx), 10)
      if (Number.isNaN(tcIndex)) continue
      const tcField = tcRest.slice(tcDotIdx + 1)

      let msgToolCalls = toolCalls.get(index)
      if (!msgToolCalls) {
        msgToolCalls = new Map()
        toolCalls.set(index, msgToolCalls)
      }
      let tc = msgToolCalls.get(tcIndex)
      if (!tc) {
        tc = { name: "", arguments: "" }
        msgToolCalls.set(tcIndex, tc)
      }
      if (tcField === "tool_call.function.name") tc.name = value
      else if (tcField === "tool_call.function.arguments") tc.arguments = value
    } else if (field.startsWith("message.contents.")) {
      const cpRest = field.slice("message.contents.".length)
      const cpDotIdx = cpRest.indexOf(".")
      if (cpDotIdx === -1) continue
      const cpIndex = Number.parseInt(cpRest.slice(0, cpDotIdx), 10)
      if (Number.isNaN(cpIndex)) continue
      const cpField = cpRest.slice(cpDotIdx + 1)

      let msgParts = contentParts.get(index)
      if (!msgParts) {
        msgParts = new Map()
        contentParts.set(index, msgParts)
      }
      let part = msgParts.get(cpIndex)
      if (!part) {
        part = { type: "text" }
        msgParts.set(cpIndex, part)
      }
      if (cpField === "message_content.type") part.type = value
      else if (cpField === "message_content.text") part.text = value
      else if (cpField === "message_content.image.image.url") part.imageUrl = value
    } else if (field.startsWith("message.")) {
      const msgField = field.slice("message.".length)
      let fields = byIndex.get(index)
      if (!fields) {
        fields = new Map()
        byIndex.set(index, fields)
      }
      fields.set(msgField, value)
    }
  }

  const maxIndex = Math.max(...byIndex.keys(), ...toolCalls.keys(), ...contentParts.keys(), -1)
  if (maxIndex === -1) return []

  const messages: ReassembledMessage[] = []
  for (let i = 0; i <= maxIndex; i++) {
    const fields = byIndex.get(i)
    const role = fields?.get("role") ?? "user"

    const msgContentParts = contentParts.get(i)
    let content: MessageContent
    if (msgContentParts && msgContentParts.size > 0) {
      const sorted = [...msgContentParts.entries()].sort(([a], [b]) => a - b)
      content = sorted.map(([, part]) => {
        if (part.type === "image" && part.imageUrl) {
          return { type: "image_url" as const, image_url: { url: part.imageUrl } }
        }
        return { type: "text" as const, text: part.text ?? "" }
      })
    } else {
      content = fields?.get("content") ?? ""
    }

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

function reassembleToolDefinitions(attrs: readonly OtlpKeyValue[]): string {
  const tools = new Map<number, string>()

  for (const attr of attrs) {
    if (!attr.key.startsWith(TOOLS_PREFIX)) continue
    const rest = attr.key.slice(TOOLS_PREFIX.length)
    const dotIdx = rest.indexOf(".")
    if (dotIdx === -1) continue
    const index = Number.parseInt(rest.slice(0, dotIdx), 10)
    if (Number.isNaN(index)) continue
    const field = rest.slice(dotIdx + 1)
    if (field === "tool.json_schema" && attr.value?.stringValue) {
      tools.set(index, attr.value.stringValue)
    }
  }

  if (tools.size === 0) return ""

  const sorted = [...tools.entries()].sort(([a], [b]) => a - b)
  const parsed = sorted.map(([, json]) => {
    try {
      return JSON.parse(json)
    } catch {
      return json
    }
  })
  return JSON.stringify(parsed)
}

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
  let systemInstructions = ""

  if (inputRaw.length > 0) {
    const result = safeTranslate(inputRaw, { direction: "input" })
    if (!result.error) {
      inputMessages = result.messages as GenAIMessage[]
      if (result.system) {
        systemInstructions = JSON.stringify(result.system)
      }
    }
  }

  const outputMessages = translateReassembled(outputRaw, "output")
  const toolDefinitions = reassembleToolDefinitions(attrs)

  return { inputMessages, outputMessages, systemInstructions, toolDefinitions }
}
