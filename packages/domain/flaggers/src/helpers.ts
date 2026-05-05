import type { TraceDetail } from "@domain/spans"

type TraceMessagesOnly = Pick<TraceDetail, "allMessages">

const TOOL_RESULT_ERROR_TEXT = /(^error\b|error:\s*|\bfailed\b|\bfailure\b|\bexception\b|\btimeout\b|\bunavailable\b)/i
const TOOL_RESULT_ERROR_STATUSES = new Set(["error", "failed", "failure"])
const EXPECTED_TOOL_HTTP_STATUS_MIN = 400
const EXPECTED_TOOL_HTTP_STATUS_MAX = 499
const ERROR_SNIPPET_MAX_LENGTH = 160

export type DeterministicFlaggerMatch =
  | { readonly matched: true; readonly feedback: string; readonly messageIndex?: number | undefined }
  | { readonly matched: false }

const NO_MATCH: DeterministicFlaggerMatch = { matched: false }
const match = (feedback: string, messageIndex?: number): DeterministicFlaggerMatch => ({
  matched: true,
  feedback,
  ...(messageIndex !== undefined ? { messageIndex } : {}),
})

export function detectToolCallErrorsFlagger(trace: TraceMessagesOnly): DeterministicFlaggerMatch {
  const toolNameById = new Map<string, string>()

  for (let msgIdx = 0; msgIdx < trace.allMessages.length; msgIdx++) {
    const message = trace.allMessages[msgIdx]!
    for (const part of message.parts) {
      if (part.type === "tool_call") {
        const toolCallId = typeof part.id === "string" ? part.id.trim() : ""
        const toolName = typeof part.name === "string" ? part.name.trim() : ""

        if (!toolCallId || !toolName) {
          const label = toolName ? `tool "${toolName}"` : "an unnamed tool"
          return match(`Malformed tool call: ${label} with missing or empty tool_call id`, msgIdx)
        }

        if (toolNameById.has(toolCallId)) {
          return match(`Duplicate tool_call id emitted for tool "${toolName}"`, msgIdx)
        }

        toolNameById.set(toolCallId, toolName)
        continue
      }

      if (part.type !== "tool_call_response") continue

      const toolCallId = typeof part.id === "string" ? part.id.trim() : ""
      if (!toolCallId || !toolNameById.has(toolCallId)) {
        return match(`Tool response references an unknown tool_call id "${toolCallId || "<empty>"}"`, msgIdx)
      }

      if (responseIndicatesFailure(part.response)) {
        const toolName = toolNameById.get(toolCallId) ?? "<unknown>"
        const snippet = extractErrorSnippet(part.response)
        return match(
          snippet ? `Tool "${toolName}" returned error: ${snippet}` : `Tool "${toolName}" returned an error`,
          msgIdx,
        )
      }
    }
  }

  return NO_MATCH
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null
}

function toHttpStatus(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value
  if (typeof value !== "string") return null
  const match = value.match(/\b([1-5]\d{2})\b/)
  return match?.[1] ? Number(match[1]) : null
}

function isExpectedToolHttpStatus(value: unknown): boolean {
  const status = toHttpStatus(value)
  return status !== null && status >= EXPECTED_TOOL_HTTP_STATUS_MIN && status <= EXPECTED_TOOL_HTTP_STATUS_MAX
}

function responseIndicatesExpectedToolError(response: unknown): boolean {
  if (typeof response === "string") {
    const trimmed = response.trim()
    if (trimmed === "") return false
    try {
      return responseIndicatesExpectedToolError(JSON.parse(trimmed))
    } catch {
      return isExpectedToolHttpStatus(trimmed)
    }
  }

  if (Array.isArray(response)) return response.length > 0 && response.every(responseIndicatesExpectedToolError)
  if (!isRecord(response)) return false

  if (
    isExpectedToolHttpStatus(response.status) ||
    isExpectedToolHttpStatus(response.statusCode) ||
    isExpectedToolHttpStatus(response.code)
  ) {
    return true
  }

  const error = response.error
  if (isRecord(error)) {
    return (
      isExpectedToolHttpStatus(error.status) ||
      isExpectedToolHttpStatus(error.statusCode) ||
      isExpectedToolHttpStatus(error.code) ||
      isExpectedToolHttpStatus(error.message)
    )
  }

  return isExpectedToolHttpStatus(error) || isExpectedToolHttpStatus(response.message)
}

function truncate(s: string | null): string | null {
  if (!s) return null
  return s.length > ERROR_SNIPPET_MAX_LENGTH ? `${s.slice(0, ERROR_SNIPPET_MAX_LENGTH)}...` : s
}

function extractErrorSnippet(response: unknown): string | null {
  if (typeof response === "string") return truncate(response.trim() || null)
  if (Array.isArray(response)) {
    for (const item of response) {
      const extracted = extractErrorSnippet(item)
      if (extracted) return extracted
    }
    return null
  }
  if (!isRecord(response)) return null

  const errorField = response.error
  if (typeof errorField === "string") {
    const snippet = truncate(errorField.trim() || null)
    if (snippet) return snippet
  }
  if (isRecord(errorField)) {
    const inner = toNonEmptyString(errorField.message) ?? toNonEmptyString(errorField.error)
    if (inner) return truncate(inner)
  }

  return truncate(toNonEmptyString(response.message) ?? toNonEmptyString(response.status))
}

function responseIndicatesFailure(response: unknown): boolean {
  if (responseIndicatesExpectedToolError(response)) return false
  if (typeof response === "string") {
    const trimmed = response.trim()
    if (trimmed === "") return false
    try {
      return responseIndicatesFailure(JSON.parse(trimmed))
    } catch {
      return TOOL_RESULT_ERROR_TEXT.test(trimmed)
    }
  }
  if (Array.isArray(response)) return response.some(responseIndicatesFailure)
  if (!isRecord(response)) return false
  if (response.isError === true || response.ok === false || response.success === false) return true

  const status = toNonEmptyString(response.status)
  if (status && TOOL_RESULT_ERROR_STATUSES.has(status.toLowerCase())) return true

  if ("error" in response) {
    const error = response.error
    if (error !== null && error !== undefined && error !== false && error !== "") return true
  }

  return Array.isArray(response.errors) && response.errors.length > 0
}

export function detectOutputSchemaValidationFlagger(trace: TraceDetail): DeterministicFlaggerMatch {
  for (let msgIdx = 0; msgIdx < trace.allMessages.length; msgIdx++) {
    const message = trace.allMessages[msgIdx]!
    if (message.role !== "assistant") continue
    for (const part of message.parts) {
      if (part.type !== "text") continue
      const content = typeof part.content === "string" ? part.content.trim() : ""
      if (!content || (!content.startsWith("{") && !content.startsWith("["))) continue

      if (content.endsWith(","))
        return match("Assistant output ended with a trailing comma, suggesting truncated JSON", msgIdx)

      let inString = false
      let escaped = false
      for (let i = 0; i < content.length; i++) {
        const char = content[i]
        if (escaped) {
          escaped = false
          continue
        }
        if (char === "\\") {
          escaped = true
          continue
        }
        if (char === '"') inString = !inString
      }
      if (inString)
        return match("Assistant output contains an unclosed JSON string, suggesting truncated output", msgIdx)

      try {
        JSON.parse(content)
      } catch {
        return match("Assistant output failed JSON parse (malformed or truncated structured output)", msgIdx)
      }
    }
  }

  return NO_MATCH
}

export function detectEmptyResponseFlagger(trace: TraceDetail): DeterministicFlaggerMatch {
  for (let msgIdx = 0; msgIdx < trace.allMessages.length; msgIdx++) {
    const message = trace.allMessages[msgIdx]!
    if (message.role !== "assistant") continue

    let hasToolCall = false
    let hasText = false
    const textParts: string[] = []

    for (const part of message.parts) {
      if (part.type === "tool_call") {
        hasToolCall = true
        continue
      }
      if (part.type === "text") {
        hasText = true
        const content = (part as { content?: unknown }).content
        if (typeof content === "string") textParts.push(content)
      }
    }

    if (hasToolCall && !hasText) continue
    const accumulatedText = textParts.join("").trim()
    if (accumulatedText === "") return match("Assistant response was empty or whitespace only", msgIdx)
    if (accumulatedText.length >= 3 && new Set(accumulatedText).size === 1) {
      return match(`Assistant response was degenerate: only the character "${accumulatedText[0]}" repeated`, msgIdx)
    }
  }

  return NO_MATCH
}
