import type { AnnotationAnchor } from "@domain/scores"
import type { GenAIMessage } from "rosetta-ai"

function joinTextParts(parts: GenAIMessage["parts"]): string {
  let out = ""
  for (const part of parts) {
    if (part.type === "text" && typeof part.content === "string") {
      out += part.content
    }
  }
  return out
}

/**
 * Resolves the exact substring the anchor refers to from the canonical GenAI messages
 * for a trace (same ordering as {@link TraceDetail.allMessages}).
 *
 * @returns `undefined` when the anchor does not select a message range, or indices are invalid.
 */
export function resolveAnnotationAnchorText(
  messages: readonly GenAIMessage[],
  anchor: Pick<AnnotationAnchor, "messageIndex" | "partIndex" | "startOffset" | "endOffset">,
): string | undefined {
  if (anchor.messageIndex === undefined) {
    return undefined
  }

  const message = messages[anchor.messageIndex]
  if (!message) {
    return undefined
  }

  let text: string
  if (anchor.partIndex !== undefined) {
    const part = message.parts[anchor.partIndex]
    if (!part) {
      return undefined
    }
    if (part.type === "text" && typeof part.content === "string") {
      text = part.content
    } else {
      return undefined
    }
  } else {
    text = joinTextParts(message.parts)
  }

  if (anchor.startOffset !== undefined && anchor.endOffset !== undefined) {
    if (anchor.startOffset > text.length || anchor.endOffset > text.length || anchor.startOffset > anchor.endOffset) {
      return undefined
    }
    text = text.slice(anchor.startOffset, anchor.endOffset)
  }

  return text
}
