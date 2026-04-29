import type { TraceDetail } from "@domain/spans"

// Re-export shared constants from parent package for convenience
export {
  MAX_EXCERPT_LENGTH,
  MAX_SNIPPET_EXCERPT_LENGTH,
  MAX_STAGES_PER_PROMPT,
  MAX_SUSPICIOUS_SNIPPETS,
} from "../constants.ts"

// ---------------------------------------------------------------------------
// SuspiciousSnippet - shared shape for snippet-based detection
// ---------------------------------------------------------------------------

export interface SuspiciousSnippet {
  /** Source of the snippet */
  readonly source: "user" | "assistant" | "tool" | "unknown"
  /** The suspicious text content */
  readonly text: string
  /** Brief reason for flagging */
  readonly reason: string
}

/**
 * Truncate text to maximum excerpt length.
 */
export function truncateExcerpt(text: string, maxLength: number = 500): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

// ---------------------------------------------------------------------------
// Text extraction helpers used across strategies
// ---------------------------------------------------------------------------

/**
 * Extract text-only parts from messages for content scanning.
 * Filters out tool calls, tool responses, and system messages.
 */
export function extractTextOnlyMessages(
  trace: Pick<TraceDetail, "allMessages">,
): Array<{ readonly role: "user" | "assistant"; readonly content: string }> {
  const result: Array<{ readonly role: "user" | "assistant"; readonly content: string }> = []

  for (const message of trace.allMessages) {
    if (message.role !== "user" && message.role !== "assistant") continue

    const textParts: string[] = []
    for (const part of message.parts) {
      if (part.type === "text" && typeof part.content === "string") {
        const trimmed = part.content.trim()
        if (trimmed) textParts.push(trimmed)
      }
    }

    if (textParts.length > 0) {
      result.push({
        role: message.role,
        content: textParts.join(" "),
      })
    }
  }

  return result
}

/**
 * Extract only user-authored text messages.
 * Used for frustration detection and user-focused analysis.
 */
export function extractUserTextMessages(trace: Pick<TraceDetail, "allMessages">): string[] {
  const result: string[] = []

  for (const message of trace.allMessages) {
    if (message.role !== "user") continue

    for (const part of message.parts) {
      if (part.type === "text" && typeof part.content === "string") {
        const trimmed = part.content.trim()
        if (trimmed) result.push(trimmed)
      }
    }
  }

  return result
}
