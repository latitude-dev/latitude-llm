import { cacheHitRate, formatCount, formatPercentage } from "@repo/utils"
import type { FlaggerConversation } from "./conversation.ts"
import { isRecord, iterMessageParts } from "./flagger-strategies/shared.ts"

type ConversationMessagesOnly = Pick<FlaggerConversation, "allMessages">
type ToolErrorConversation = Pick<FlaggerConversation, "allMessages" | "definedTools">

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

export type ToolCallErrorFindingKind = "malformed" | "duplicate" | "undeclared" | "unknown-id" | "error"

export interface ToolCallErrorFinding {
  readonly kind: ToolCallErrorFindingKind
  readonly feedback: string
  readonly messageIndex: number
  readonly toolName?: string | undefined
  readonly toolCallId?: string | undefined
  /**
   * A later tool call succeeded, so the agent carried on working after this
   * error. Only meaningful for `kind: "error"`; structural defects (malformed,
   * duplicate, undeclared) are not something a run recovers from.
   */
  readonly recovered?: boolean
}

const conversationHasAnyToolCall = (conversation: ConversationMessagesOnly): boolean =>
  conversation.allMessages.some((message) => {
    if (message.role !== "assistant") return false
    for (const rawPart of iterMessageParts(message.parts)) {
      if (isRecord(rawPart) && rawPart.type === "tool_call") return true
    }
    return false
  })

// Every tool-call defect in encounter order; the deterministic flagger
// annotates the first, the `tool:error` hint gatherer surfaces them all.
export function collectToolCallErrorFindings(conversation: ToolErrorConversation): readonly ToolCallErrorFinding[] {
  const findings: (ToolCallErrorFinding & { responseIndex?: number })[] = []
  const callById = new Map<string, { name: string; messageIndex: number }>()
  const successfulCallIds = new Set<string>()
  let lastSuccessfulResponseIndex = -1
  const hasAnyToolCall = conversationHasAnyToolCall(conversation)
  const definedTools =
    conversation.definedTools && conversation.definedTools.length > 0 ? new Set(conversation.definedTools) : null

  for (let msgIdx = 0; msgIdx < conversation.allMessages.length; msgIdx++) {
    const message = conversation.allMessages[msgIdx]!
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
          findings.push({
            kind: "malformed",
            feedback: `Malformed tool call: ${label} with missing or empty tool_call id`,
            messageIndex: msgIdx,
            ...(toolName ? { toolName } : {}),
          })
          continue
        }

        if (callById.has(toolCallId)) {
          findings.push({
            kind: "duplicate",
            feedback: `Duplicate tool_call id emitted for tool "${toolName}"`,
            messageIndex: msgIdx,
            toolName,
            toolCallId,
          })
          continue
        }

        callById.set(toolCallId, { name: toolName, messageIndex: msgIdx })

        if (definedTools && !definedTools.has(toolName)) {
          findings.push({
            kind: "undeclared",
            feedback: `Assistant called tool "${toolName}" which is not in the declared toolset`,
            messageIndex: msgIdx,
            toolName,
            toolCallId,
          })
        }
        continue
      }

      if (part.type !== "tool_call_response" || (message.role !== "tool" && message.role !== "function")) continue

      const toolCallId = typeof part.id === "string" ? part.id.trim() : ""
      const call = toolCallId ? callById.get(toolCallId) : undefined
      if (!call) {
        // Input truncation can strip the assistant turn that made the call,
        // leaving orphan responses; only flag unknown ids when some tool call
        // survived in the window.
        if (!hasAnyToolCall) continue
        findings.push({
          kind: "unknown-id",
          feedback: `Tool response references an unknown tool_call id "${toolCallId || "<empty>"}"`,
          messageIndex: msgIdx,
          ...(toolCallId ? { toolCallId } : {}),
        })
        continue
      }

      if (toolResponseIndicatesFailure(part.response)) {
        const snippet = extractToolErrorSnippet(part.response)
        findings.push({
          kind: "error",
          feedback: snippet
            ? `Tool "${call.name}" returned error: ${snippet}`
            : `Tool "${call.name}" returned an error`,
          messageIndex: call.messageIndex,
          toolName: call.name,
          toolCallId,
          responseIndex: msgIdx,
        })
      } else if (toolCallId) {
        // Successful execution proves availability; incomplete definedTools must not flag it.
        successfulCallIds.add(toolCallId)
        lastSuccessfulResponseIndex = msgIdx
      }
    }
  }

  const kept = findings.filter(
    (finding) =>
      successfulCallIds.size === 0 ||
      !(finding.kind === "undeclared" && finding.toolCallId && successfulCallIds.has(finding.toolCallId)),
  )

  // A tool error followed by a later successful call is one the agent worked
  // through — an agent that runs hundreds of tools hits these constantly and
  // the user never sees them. Marked here rather than dropped, because the hint
  // gatherer still wants every defect.
  return kept.map((finding) =>
    finding.kind === "error" && finding.responseIndex !== undefined
      ? { ...finding, recovered: lastSuccessfulResponseIndex > finding.responseIndex }
      : finding,
  )
}

/**
 * Flags the first defect the run did NOT work through. A tool error the agent
 * retried or moved past is invisible to the user — a coding agent produces them
 * by the dozen — and raising a signal for one costs a clustering pass, a naming
 * generation and a row in someone's triage list. Structural defects (malformed,
 * duplicate, undeclared, unknown id) always flag: they are bugs in how the
 * agent calls tools, not transient failures.
 */
export function detectToolCallErrorsFlagger(conversation: ToolErrorConversation): DeterministicFlaggerMatch {
  const finding = collectToolCallErrorFindings(conversation).find(
    (candidate) => candidate.kind !== "error" || candidate.recovered !== true,
  )
  return finding ? match(finding.feedback, finding.messageIndex) : NO_MATCH
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

export function extractToolErrorSnippet(response: unknown): string | null {
  if (typeof response === "string") return truncate(response.trim() || null)
  if (Array.isArray(response)) {
    for (const item of response) {
      const extracted = extractToolErrorSnippet(item)
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

export function toolResponseIndicatesFailure(response: unknown): boolean {
  if (responseIndicatesExpectedToolError(response)) return false
  if (typeof response === "string") {
    const trimmed = response.trim()
    if (trimmed === "") return false
    try {
      return toolResponseIndicatesFailure(JSON.parse(trimmed))
    } catch {
      return false
    }
  }
  if (Array.isArray(response)) return response.some(toolResponseIndicatesFailure)
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

function looksLikeStructuredJsonOutput(content: string): boolean {
  if (content.startsWith("{")) return true
  if (!content.startsWith("[")) return false
  if (/^\[[^\]]+\]\(/.test(content)) return false

  const afterBracket = content.slice(1).trimStart()
  if (afterBracket.length === 0) return true

  const first = afterBracket[0]!
  if (first === "]" || first === "{" || first === "[" || first === '"' || first === "-") return true
  if (first >= "0" && first <= "9") return true
  return afterBracket.startsWith("true") || afterBracket.startsWith("false") || afterBracket.startsWith("null")
}

export function detectOutputSchemaValidationFlagger(conversation: ConversationMessagesOnly): DeterministicFlaggerMatch {
  for (let msgIdx = 0; msgIdx < conversation.allMessages.length; msgIdx++) {
    const message = conversation.allMessages[msgIdx]!
    if (message.role !== "assistant") continue
    for (const rawPart of iterMessageParts(message.parts)) {
      if (!isRecord(rawPart) || rawPart.type !== "text") continue
      const content = typeof rawPart.content === "string" ? rawPart.content.trim() : ""
      if (!content || !looksLikeStructuredJsonOutput(content)) continue

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

export function detectEmptyResponseFlagger(conversation: ConversationMessagesOnly): DeterministicFlaggerMatch {
  // Only the most recent assistant turn matters — earlier "empty-looking" entries
  // are intermediate agentic-loop steps in `lastInput` history, not the final response.
  // `reasoning` and `tool_call` parts both signal model activity, so a message containing
  // either is not empty regardless of whether a text part is present.
  let lastAssistantIdx = -1
  for (let i = conversation.allMessages.length - 1; i >= 0; i--) {
    if (conversation.allMessages[i]!.role === "assistant") {
      lastAssistantIdx = i
      break
    }
  }
  if (lastAssistantIdx === -1) return NO_MATCH

  const message = conversation.allMessages[lastAssistantIdx]!
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

type CacheConversation = Pick<
  FlaggerConversation,
  "allMessages" | "tokensInput" | "tokensCacheRead" | "tokensCacheCreate"
>

/**
 * Flags large multi-turn traces where prompt caching is active but the hit rate
 * is unexpectedly low — the signal a broken cache implementation produces (e.g.
 * nondeterministic prompt/tool-payload ordering, session resets, or context
 * compaction), which can multiply token cost. Guards against false positives:
 * single-turn or tiny-input traces, and traces where no cache was ever written,
 * never match. Never calls an LLM.
 */
export function detectLowCacheHitRateFlagger(conversation: CacheConversation): DeterministicFlaggerMatch {
  if (conversation.allMessages.length < MIN_CACHEABLE_MESSAGES) return NO_MATCH
  if (conversation.tokensCacheCreate <= 0) return NO_MATCH

  const totalInput = conversation.tokensInput + conversation.tokensCacheRead + conversation.tokensCacheCreate
  if (totalInput < MIN_TOTAL_INPUT_TOKENS) return NO_MATCH

  const rate = cacheHitRate({
    input: conversation.tokensInput,
    cacheRead: conversation.tokensCacheRead,
    cacheCreate: conversation.tokensCacheCreate,
  })
  if (rate === null || rate >= LOW_CACHE_HIT_RATE_THRESHOLD) return NO_MATCH

  return match(
    `Low cache hit rate (${formatPercentage(rate)}) on a large multi-turn trace (${formatCount(totalInput)} input tokens): most context was re-sent uncached instead of read from cache. This usually means a broken cache implementation (nondeterministic prompt or tool-payload ordering, session resets, or context compaction) and can multiply token cost.`,
  )
}
