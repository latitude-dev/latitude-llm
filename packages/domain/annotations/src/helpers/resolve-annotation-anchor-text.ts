import type { AnnotationAnchor } from "@domain/scores"
import { formatPartText, getAnchorPartText, joinAnchorPartText } from "@repo/utils"
import type { GenAIMessage } from "rosetta-ai"

/**
 * Resolves the exact substring the anchor refers to from the canonical GenAI messages
 * for a trace (same ordering as {@link TraceDetail.allMessages}).
 *
 * When `anchor.textFormat` is set, the part text is first transformed with
 * {@link formatPartText} so offsets line up with the representation the user
 * saw when the selection was captured. Which parts are anchorable comes from
 * {@link getAnchorPartText}, shared with the conversation UI that captures the
 * selection — a part selectable there but rejected here is a guaranteed 400.
 *
 * @returns `undefined` when the anchor does not select a message range, or indices are invalid.
 */
export function resolveAnnotationAnchorText(
  messages: readonly GenAIMessage[],
  anchor: AnnotationAnchor,
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
    const partText = getAnchorPartText(message, anchor.partIndex)
    if (partText === null) {
      return undefined
    }
    text = partText
  } else {
    text = joinAnchorPartText(message)
  }

  text = formatPartText(text, anchor.textFormat)

  if (anchor.startOffset !== undefined && anchor.endOffset !== undefined) {
    if (anchor.startOffset > text.length || anchor.endOffset > text.length || anchor.startOffset > anchor.endOffset) {
      return undefined
    }
    text = text.slice(anchor.startOffset, anchor.endOffset)
  }

  return text
}
