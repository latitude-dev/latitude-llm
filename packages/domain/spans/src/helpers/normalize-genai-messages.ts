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
 * `result` into `gen_ai.{input,output}.messages`. The convention's part schemas are
 * `additionalProperties: true`, so an unknown `type` is passed through rather than rejected, and the
 * wrong vocabulary reaches storage silently. Every consumer keys off the canonical names, so a
 * `thinking` part is absent from the lexical search index, wrongly included in the embedding, and
 * rendered through the UI's unknown-part fallback; a tool result under `result` is invisible to the
 * indexer, which reads `response`.
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
