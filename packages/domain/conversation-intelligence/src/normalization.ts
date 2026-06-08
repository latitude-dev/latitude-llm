/** Message normalization shared by the analyzer and workflow warm-up activities. Embedding cache keys depend on this exact text, so all consumers must use these helpers. */

export interface NormalizedMessage {
  readonly index: number
  readonly role: "user" | "assistant" | "tool" | "system" | "unknown"
  readonly text: string
}

export const roleOf = (message: unknown): NormalizedMessage["role"] => {
  if (message === null || typeof message !== "object") return "unknown"
  const role = (message as { readonly role?: unknown }).role
  if (role === "user" || role === "assistant" || role === "tool" || role === "system") return role
  return "unknown"
}

const partText = (part: unknown): string => {
  if (part === null || typeof part !== "object") return ""
  const p = part as Record<string, unknown>
  if (typeof p.content === "string") return p.content
  if (p.type === "tool_call" && typeof p.name === "string") return `[TOOL CALL: ${p.name}]`
  if (p.type === "tool_call_response") return typeof p.result === "string" ? p.result : "[TOOL RESULT]"
  return ""
}

export const textOf = (message: unknown): string => {
  if (message === null || typeof message !== "object") return ""
  const m = message as { readonly parts?: unknown; readonly content?: unknown }
  if (typeof m.content === "string") return m.content.trim()
  if (!Array.isArray(m.parts)) return ""
  return m.parts.map(partText).filter(Boolean).join("\n").trim()
}

export const stripToolTelemetry = (content: string): string =>
  content
    .split("\n")
    .filter((line) => !line.trim().startsWith("[TOOL CALL:") && line.trim() !== "[TOOL RESULT]")
    .join("\n")
    .trim()

// Tool-call markers and bare tool-result placeholders are stripped before any
// semantic processing: they polluted turn embeddings (a `get_customer_by_phone`
// tool call scored as escalation) and label evidence.
export const normalizeMessages = (messages: readonly unknown[]): readonly NormalizedMessage[] =>
  messages
    .map((message, index) => ({ index, role: roleOf(message), text: stripToolTelemetry(textOf(message)) }))
    .filter((message) => message.text.length > 0)

export const documentFromMessages = (messages: readonly NormalizedMessage[]): string =>
  messages.map((message) => `${message.index}. ${message.role}: ${message.text}`).join("\n\n")
