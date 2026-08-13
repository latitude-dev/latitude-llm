// A part the conversation UI lets a user select but this rejects 400s every annotation on it.

// Structural rather than `rosetta-ai`'s GenAIMessage: @repo/utils takes no domain dependencies.
interface AnchorPart {
  readonly type?: string | undefined
  readonly content?: unknown
}

interface AnchorMessage {
  readonly parts?: readonly (AnchorPart | null | undefined)[] | undefined
  readonly content?: unknown
}

/** The part types the conversation renders as selectable prose. */
const ANCHOR_PART_TYPES: ReadonlySet<string> = new Set(["text", "reasoning"])

const textOf = (part: AnchorPart | null | undefined): string | null =>
  part && part.type !== undefined && ANCHOR_PART_TYPES.has(part.type) && typeof part.content === "string"
    ? part.content
    : null

/** Producers that emit a bare `content` string get the same single text part the UI synthesizes for them. */
const partsOf = (message: AnchorMessage): readonly (AnchorPart | null | undefined)[] => {
  if (message.parts && message.parts.length > 0) return message.parts
  return typeof message.content === "string" ? [{ type: "text", content: message.content }] : []
}

/** `null` when the part is absent or holds something other than selectable prose. */
export function getAnchorPartText(message: AnchorMessage | null | undefined, partIndex: number): string | null {
  if (!message) return null
  return textOf(partsOf(message)[partIndex])
}

/** Concatenation of every anchorable part, for message-level anchors that carry no `partIndex`. */
export function joinAnchorPartText(message: AnchorMessage | null | undefined): string {
  if (!message) return ""
  let out = ""
  for (const part of partsOf(message)) {
    const text = textOf(part)
    if (text !== null) out += text
  }
  return out
}
