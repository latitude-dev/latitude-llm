import { safeStringifyJson } from "@repo/utils"
import type { GenAIMessage, GenAIPart } from "rosetta-ai"

const PRIVATE_THOUGHT = "Thought in private..."

function formatUriLike(value: string, fallback: string): string {
  try {
    return new URL(value).toString()
  } catch {
    return fallback
  }
}

/**
 * Renders a single GenAI message part as plain text for prompts, logs, or exports.
 * Mirrors legacy `formatMessage` content-part handling (text, reasoning, media, tools).
 */
export function formatGenAIPart(part: GenAIPart): string {
  switch (part.type) {
    case "text":
      return typeof part.content === "string" ? part.content : ""
    case "reasoning": {
      const c = part.content
      return typeof c === "string" && c.trim() !== "" ? c : PRIVATE_THOUGHT
    }
    case "blob": {
      if (part.modality === "image") return "[IMAGE]"
      if (part.modality === "video") return "[VIDEO]"
      if (part.modality === "audio") return "[AUDIO]"
      return `[BLOB:${String(part.modality)}]`
    }
    case "file":
      return `[FILE:${part.file_id}]`
    case "uri":
      return typeof part.uri === "string" ? formatUriLike(part.uri, "[URI]") : "[URI]"
    case "tool_call":
      return safeStringifyJson(
        { id: part.id ?? null, name: part.name, arguments: part.arguments ?? null },
        "[TOOL CALL]",
      )
    case "tool_call_response":
      return safeStringifyJson(part.response, "[TOOL RESULT]")
    default:
      return formatLooseGenAIPart(part)
  }
}

function formatLooseGenAIPart(part: GenAIPart): string {
  const p = part as Record<string, unknown>
  const t = part.type
  if (t === "redacted-reasoning" || t === "redacted_thinking") {
    const data = p.data
    return typeof data === "string" && data.trim() !== "" ? data : PRIVATE_THOUGHT
  }
  return safeStringifyJson(part, `[${String(t)}]`)
}

/** Concatenates all parts of a GenAI message (legacy `formatMessage` over `parts[]`). */
export function formatGenAIMessage(message: GenAIMessage): string {
  return message.parts
    .map((p) => formatGenAIPart(p))
    .join("\n")
    .trim()
}

/** Renders a turn-by-turn transcript (legacy `formatConversation`). */
export function formatGenAIConversation(messages: readonly GenAIMessage[]): string {
  let result = ""
  for (const message of messages) {
    if (!message) continue
    const role = message.role
    const speaker = role.charAt(0).toUpperCase() + role.slice(1)
    result += `${speaker}: ${formatGenAIMessage(message)}\n\n`
  }
  return result.trim()
}

/**
 * Like {@link formatGenAIConversation} but prefixes each turn with `[message i]` and uses `---` separators.
 * Use when the consumer must align text to **0-based indices** in canonical trace payloads (e.g.
 * `AnnotationScoreMetadata.messageIndex`, anchor resolution over `TraceDetail.allMessages`).
 * For a human-style transcript only, use {@link formatGenAIConversation} instead.
 */
export function formatGenAIMessagesForEnrichmentPrompt(messages: readonly GenAIMessage[]): string {
  const blocks: string[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const text = formatGenAIMessage(m)
    const body = text || "<no plain text in this message>"
    blocks.push(`[message ${i}] role=${m.role}\n${body}`)
  }
  return blocks.join("\n\n---\n\n")
}
