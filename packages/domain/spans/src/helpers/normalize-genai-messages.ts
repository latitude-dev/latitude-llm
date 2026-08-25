/**
 * Non-conformant message parts rewritten into the GenAI semantic convention.
 *
 * The convention is the source of truth, and `rosetta-ai`'s `Provider.GenAI` implements it: a
 * reasoning part is `{type: "reasoning", content}`, a tool result is
 * `{type: "tool_call_response", id, response}` under `role: "tool"`, and inline binary data is
 * `{type: "blob", mime_type, modality, content}`. Nothing in the spec is called `thinking`,
 * `binary`, or carries a tool result under `result`.
 *
 * Some instrumentations emit those names anyway — Pydantic AI writes `thinking`, `binary` and
 * `result` into `gen_ai.{input,output}.messages`, and an emitter wrapping OpenAI's Responses API can
 * pass its *items* through as parts (`output_text`, `function_call`, `function_call_output`). The
 * convention's part schemas are `additionalProperties: true`, so an unknown `type` is passed through
 * rather than rejected, and the wrong vocabulary reaches storage silently. Every consumer keys off
 * the canonical names, so a `thinking` part is absent from the lexical search index, wrongly included
 * in the embedding, and rendered through the UI's unknown-part fallback; a tool result under `result`
 * is invisible to the indexer, which reads `response`; and a conversation of Responses items renders
 * as JSON blobs with every tool call missing.
 *
 * Rewriting them here, on the way in, is what keeps the rest of the product free of vendor
 * spellings — no consumer should have to know a non-conformant type exists.
 */
import { resolveContentModality } from "@repo/utils"
import type { GenAIMessage } from "rosetta-ai"

type Part = Record<string, unknown>

const isRecord = (value: unknown): value is Part => value !== null && typeof value === "object" && !Array.isArray(value)

const partsOf = (message: unknown): Part[] =>
  isRecord(message) && Array.isArray(message.parts) ? (message.parts as Part[]) : []

const withKnownField = (part: Part, field: string, value: unknown): Part => {
  const metadata = isRecord(part._provider_metadata) ? part._provider_metadata : {}
  const known = isRecord(metadata._known_fields) ? metadata._known_fields : {}
  return {
    ...part,
    _provider_metadata: { ...metadata, _known_fields: { ...known, [field]: value } },
  }
}

/** A Responses `function_call` carries its arguments as a JSON string; consumers expect the value. */
const parsedArguments = (value: unknown): unknown => {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

// A Responses item pairs a call to its output by `call_id`; `id` is the item's own identity, so it is
// only a fallback.
const pairingId = (part: Part): Record<string, unknown> => {
  const id = typeof part.call_id === "string" && part.call_id ? part.call_id : part.id
  return id === undefined ? {} : { id }
}

const normalizePart = (part: unknown): unknown => {
  if (!isRecord(part)) return part

  // Anthropic's name for a reasoning part, which some instrumentations copy verbatim into the
  // semconv attributes. It puts the text under `thinking`; accept `content` too, since a vendor that
  // renamed the type without renaming the field is the same mistake one step further along.
  if (part.type === "thinking" || part.type === "redacted_thinking") {
    const content = typeof part.content === "string" ? part.content : part.thinking
    if (typeof content !== "string" || !content) return part
    const { thinking: _thinking, content: _content, type: _type, ...rest } = part
    return { ...rest, type: "reasoning", content }
  }

  // Pydantic AI's name for inline binary data: base64 under `content`, mime under `media_type`.
  if (part.type === "binary" && typeof part.content === "string") {
    const mime = typeof part.media_type === "string" ? part.media_type : null
    const { media_type: _mediaType, type: _type, ...rest } = part
    return {
      ...rest,
      type: "blob",
      ...(mime ? { mime_type: mime } : {}),
      modality: resolveContentModality(typeof part.modality === "string" ? part.modality : "", mime),
    }
  }

  // OpenAI's Responses API names its text blocks by direction. Both are plain text.
  if (part.type === "output_text" || part.type === "input_text") {
    const content = typeof part.content === "string" ? part.content : part.text
    if (typeof content !== "string" || !content) return part
    const { text: _text, content: _content, type: _type, ...rest } = part
    return { ...rest, type: "text", content }
  }

  if (part.type === "function_call" || part.type === "custom_tool_call") {
    const name = typeof part.name === "string" ? part.name : ""
    if (!name) return part
    // A custom tool call carries a free-form `input` where a function call carries `arguments`.
    const { call_id: _callId, id: _id, arguments: args, input, name: _name, type: _type, ...rest } = part
    return {
      ...rest,
      type: "tool_call",
      ...pairingId(part),
      name,
      arguments: parsedArguments(args === undefined ? input : args),
    }
  }

  if (part.type === "function_call_output" || part.type === "custom_tool_call_output") {
    const { call_id: _callId, id: _id, output, type: _type, ...rest } = part
    return { ...rest, type: "tool_call_response", ...pairingId(part), response: output }
  }

  if (part.type === "tool_call_response") {
    let normalized = part
    // `response` is the required field in the convention; `result` is Pydantic AI's spelling.
    if (normalized.response === undefined && "result" in normalized) {
      const { result, ...rest } = normalized
      normalized = { ...rest, response: result }
    }
    // The convention's part has no top-level `name`; the tool's name belongs in known fields, which
    // is where the conversation UI reads it from to label the block.
    if (typeof normalized.name === "string") {
      const { name, ...rest } = normalized
      normalized = withKnownField(rest, "toolName", name)
    }
    return normalized
  }

  return part
}

/**
 * Tool results moved into their own `tool` message.
 *
 * Downstream pairing keys off `role === "tool"`, and providers disagree about where a result
 * lives: Anthropic nests it in a `user` turn, and OTEL keeps whatever the provider used.
 */
const hoistToolResults = (messages: readonly GenAIMessage[]): GenAIMessage[] => {
  const out: GenAIMessage[] = []
  for (const message of messages) {
    const parts = partsOf(message)
    if (message.role === "tool" || !parts.some((part) => part?.type === "tool_call_response")) {
      out.push(message)
      continue
    }
    const toolParts = parts.filter((part) => part?.type === "tool_call_response")
    const otherParts = parts.filter((part) => part?.type !== "tool_call_response")
    out.push({ role: "tool", parts: toolParts } as GenAIMessage)
    if (otherParts.length > 0) out.push({ ...message, parts: otherParts } as GenAIMessage)
  }
  return out
}

/** OTEL GenAI messages in the canonical vocabulary, with tool results under the `tool` role. */
export const normalizeGenAIMessages = (messages: readonly GenAIMessage[]): GenAIMessage[] =>
  hoistToolResults(
    messages.map((message) =>
      isRecord(message) && Array.isArray(message.parts)
        ? ({ ...message, parts: message.parts.map(normalizePart) } as GenAIMessage)
        : message,
    ),
  )
