import type { TraceDetail } from "@domain/spans"
import { cacheHitRate, formatCount, formatPercentage } from "@repo/utils"
import { isRecord, iterMessageParts } from "./flagger-strategies/shared.ts"

type TraceMessagesOnly = Pick<TraceDetail, "allMessages">

const TOOL_RESULT_ERROR_STATUSES = new Set(["error", "failed", "failure"])
const EXPECTED_TOOL_HTTP_STATUS_MIN = 400
const EXPECTED_TOOL_HTTP_STATUS_MAX = 499
const ERROR_SNIPPET_MAX_LENGTH = 160

// Below this fraction of input tokens served from cache, caching is essentially
// not working: a healthy multi-turn agent re-reads the great majority of its
// repeated context. Kept conservative (30%) so only clearly-broken caching is
// flagged, not merely suboptimal hit rates.
const LOW_CACHE_HIT_RATE_THRESHOLD = 0.3
// Caching only matters at scale — providers require ~1k tokens per cache block,
// and a low rate on a small prompt is not a meaningful overcharge.
const MIN_TOTAL_INPUT_TOKENS = 20_000
// Caching only pays off when earlier context is re-sent on a later turn; a
// single-turn trace has nothing to read back, so cacheCreate>0 / cacheRead=0 is
// expected there, not broken. Four messages guarantees at least one follow-up.
const MIN_CACHEABLE_MESSAGES = 4

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
  const callById = new Map<string, { name: string; messageIndex: number }>()

  for (let msgIdx = 0; msgIdx < trace.allMessages.length; msgIdx++) {
    const message = trace.allMessages[msgIdx]!
    if (message.role !== "assistant" && message.role !== "tool" && message.role !== "function") continue

    for (const rawPart of iterMessageParts(message.parts)) {
      if (!isRecord(rawPart) || typeof rawPart.type !== "string") continue
      const part = rawPart

      if (part.type === "tool_call") {
        if (message.role !== "assistant") continue
        const toolCallId = typeof part.id === "string" ? part.id.trim() : ""
        const toolName = typeof part.name === "string" ? part.name.trim() : ""

        if (!toolCallId || !toolName) {
          const label = toolName ? `tool "${toolName}"` : "an unnamed tool"
          return match(`Malformed tool call: ${label} with missing or empty tool_call id`, msgIdx)
        }

        if (callById.has(toolCallId)) {
          return match(`Duplicate tool_call id emitted for tool "${toolName}"`, msgIdx)
        }

        callById.set(toolCallId, { name: toolName, messageIndex: msgIdx })
        continue
      }

      if (part.type !== "tool_call_response" || (message.role !== "tool" && message.role !== "function")) continue

      const toolCallId = typeof part.id === "string" ? part.id.trim() : ""
      const call = toolCallId ? callById.get(toolCallId) : undefined
      if (!call) {
        if (isLikelyTruncatedToolResponse(trace.allMessages, msgIdx, callById.size)) continue
        return match(`Tool response references an unknown tool_call id "${toolCallId || "<empty>"}"`, msgIdx)
      }

      if (responseIndicatesFailure(part.response)) {
        const snippet = extractErrorSnippet(part.response)
        return match(
          snippet ? `Tool "${call.name}" returned error: ${snippet}` : `Tool "${call.name}" returned an error`,
          call.messageIndex,
        )
      }
    }
  }

  return NO_MATCH
}

function isLikelyTruncatedToolResponse(
  messages: TraceMessagesOnly["allMessages"],
  messageIndex: number,
  registeredCallCount: number,
): boolean {
  if (registeredCallCount > 0 || messageIndex === 0) return false
  for (let i = messageIndex + 1; i < messages.length; i++) {
    if (messages[i]!.role === "assistant") return true
  }
  return false
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
      return false
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
    for (const rawPart of iterMessageParts(message.parts)) {
      if (!isRecord(rawPart) || rawPart.type !== "text") continue
      const content = typeof rawPart.content === "string" ? rawPart.content.trim() : ""
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
  // Only the most recent assistant turn matters — earlier "empty-looking" entries
  // are intermediate agentic-loop steps in `lastInput` history, not the final response.
  // `reasoning` and `tool_call` parts both signal model activity, so a message containing
  // either is not empty regardless of whether a text part is present.
  let lastAssistantIdx = -1
  for (let i = trace.allMessages.length - 1; i >= 0; i--) {
    if (trace.allMessages[i]!.role === "assistant") {
      lastAssistantIdx = i
      break
    }
  }
  if (lastAssistantIdx === -1) return NO_MATCH

  const message = trace.allMessages[lastAssistantIdx]!
  let hasNonTextProduction = false
  const textParts: string[] = []

  for (const rawPart of iterMessageParts(message.parts)) {
    if (!isRecord(rawPart) || typeof rawPart.type !== "string") continue
    const part = rawPart
    if (part.type === "tool_call" || part.type === "reasoning") {
      hasNonTextProduction = true
      continue
    }
    if (part.type === "text") {
      const content = part.content
      if (typeof content === "string") textParts.push(content)
    }
  }

  if (hasNonTextProduction) return NO_MATCH

  const accumulatedText = textParts.join("").trim()
  if (accumulatedText === "") return match("Assistant response was empty or whitespace only", lastAssistantIdx)
  if (accumulatedText.length >= 3 && new Set(accumulatedText).size === 1) {
    return match(
      `Assistant response was degenerate: only the character "${accumulatedText[0]}" repeated`,
      lastAssistantIdx,
    )
  }

  return NO_MATCH
}

type CacheTrace = Pick<TraceDetail, "allMessages" | "tokensInput" | "tokensCacheRead" | "tokensCacheCreate">

/**
 * Flags large multi-turn traces where prompt caching is active but the hit rate
 * is unexpectedly low — the signal a broken cache implementation produces (e.g.
 * nondeterministic prompt/tool-payload ordering, session resets, or context
 * compaction), which can multiply token cost. Guards against false positives:
 * single-turn or tiny-input traces, and traces where no cache was ever written,
 * never match. Never calls an LLM.
 */
export function detectLowCacheHitRateFlagger(trace: CacheTrace): DeterministicFlaggerMatch {
  if (trace.allMessages.length < MIN_CACHEABLE_MESSAGES) return NO_MATCH
  if (trace.tokensCacheCreate <= 0) return NO_MATCH

  const totalInput = trace.tokensInput + trace.tokensCacheRead + trace.tokensCacheCreate
  if (totalInput < MIN_TOTAL_INPUT_TOKENS) return NO_MATCH

  const rate = cacheHitRate({
    input: trace.tokensInput,
    cacheRead: trace.tokensCacheRead,
    cacheCreate: trace.tokensCacheCreate,
  })
  if (rate === null || rate >= LOW_CACHE_HIT_RATE_THRESHOLD) return NO_MATCH

  return match(
    `Low cache hit rate (${formatPercentage(rate)}) on a large multi-turn trace (${formatCount(totalInput)} input tokens): most context was re-sent uncached instead of read from cache. This usually means a broken cache implementation (nondeterministic prompt or tool-payload ordering, session resets, or context compaction) and can multiply token cost.`,
  )
}
