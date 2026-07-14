import { stableStringify } from "@repo/utils"
import type { GenAIMessage } from "rosetta-ai"
import type { SpanMessagesData } from "../ports/span-repository.ts"

/** A span reference carrying its trace, so lookups stay correct across a multi-trace session. */
export interface ConversationSpanRef {
  readonly traceId: string
  readonly spanId: string
}

function fingerprintMessage(msg: GenAIMessage): string {
  return msg.parts
    .map((part) => {
      if (part.type === "text") {
        return (part as { content: string }).content.toLowerCase().replace(/\s+/g, " ").trim()
      }
      if (part.type === "tool_call") {
        const tc = part as { name?: string; id?: string; arguments?: unknown }
        return `tool_call:${tc.name ?? ""}:${tc.id ?? JSON.stringify(tc.arguments ?? {})}`
      }
      return ""
    })
    .filter(Boolean)
    .join("|")
}

function scoreContextMatch(spanInputs: readonly GenAIMessage[], preceding: readonly GenAIMessage[]): number {
  if (spanInputs.length === 0 || preceding.length === 0) return 0

  const len = Math.min(spanInputs.length, preceding.length)
  let matches = 0

  for (let j = 0; j < len; j++) {
    const spanMsg = spanInputs[spanInputs.length - 1 - j]
    const prevMsg = preceding[preceding.length - 1 - j]
    if (!spanMsg || !prevMsg) break
    if (fingerprintMessage(spanMsg) === fingerprintMessage(prevMsg)) {
      matches++
    } else {
      break
    }
  }

  return matches / Math.max(spanInputs.length, 1)
}

/** Canonical form of tool arguments (object or JSON string) so call and execute spans compare equal. */
function canonicalizeToolArgs(value: unknown): string {
  if (value === undefined || value === null) return ""
  let parsed: unknown = value
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value)
    } catch {
      return value.replace(/\s+/g, "")
    }
  }
  try {
    return stableStringify(parsed)
  } catch {
    return String(value)
  }
}

export function buildConversationSpanMaps(
  allMessages: readonly GenAIMessage[],
  spans: readonly SpanMessagesData[],
): { messageSpanMap: Record<number, ConversationSpanRef>; toolCallSpanMap: Record<string, ConversationSpanRef> } {
  const refOf = (span: SpanMessagesData): ConversationSpanRef => ({
    traceId: span.traceId as string,
    spanId: span.spanId as string,
  })

  // Tool call map: toolCallId → span ref (deterministic via execute_tool spans)
  const toolCallSpanMap: Record<string, ConversationSpanRef> = {}
  for (const span of spans) {
    if (span.toolCallId) {
      toolCallSpanMap[span.toolCallId] = refOf(span)
    }
  }

  // Cross-span fallback: OpenInference (e.g. google-adk) never carries the execute_tool span's
  // call id onto the conversation messages, so a tool_call whose id doesn't resolve above is
  // linked to its execute span by name+args+order — otherwise the tool result can't navigate.
  const executeSpans = spans
    .filter((span) => span.operation === "execute_tool" && span.toolName)
    .map((span) => ({ ref: refOf(span), name: span.toolName, args: canonicalizeToolArgs(span.toolInput) }))
  if (executeSpans.length > 0) {
    const consumed = new Set<number>()
    for (const msg of allMessages) {
      if (msg.role !== "assistant") continue
      for (const part of msg.parts ?? []) {
        if (part.type !== "tool_call") continue
        const tc = part as { id?: string; name?: string; arguments?: unknown }
        if (!tc.id || !tc.name || toolCallSpanMap[tc.id]) continue
        const args = canonicalizeToolArgs(tc.arguments)
        let idx = executeSpans.findIndex((s, k) => !consumed.has(k) && s.name === tc.name && s.args === args)
        if (idx === -1) idx = executeSpans.findIndex((s, k) => !consumed.has(k) && s.name === tc.name)
        const match = idx >= 0 ? executeSpans[idx] : undefined
        if (!match) continue
        consumed.add(idx)
        toolCallSpanMap[tc.id] = match.ref
      }
    }
  }

  // Fingerprint index: output fingerprint → candidate spans
  const fingerprintIndex = new Map<string, SpanMessagesData[]>()
  for (const span of spans) {
    const firstOutput = span.outputMessages[0]
    if (!firstOutput) continue
    const fp = fingerprintMessage(firstOutput)
    const bucket = fingerprintIndex.get(fp)
    if (bucket) {
      bucket.push(span)
    } else {
      fingerprintIndex.set(fp, [span])
    }
  }

  // Walk allMessages and attribute each assistant message to a span
  const messageSpanMap: Record<number, ConversationSpanRef> = {}
  for (let i = 0; i < allMessages.length; i++) {
    const msg = allMessages[i]
    if (!msg || msg.role !== "assistant") continue

    const fp = fingerprintMessage(msg)
    const candidates = fingerprintIndex.get(fp)
    if (!candidates || candidates.length === 0) continue

    if (candidates.length === 1) {
      const only = candidates[0]
      if (only) messageSpanMap[i] = refOf(only)
      continue
    }

    // Disambiguate by context: score each candidate's input against preceding messages
    const preceding = allMessages.slice(0, i)
    let best = candidates[0]
    let bestScore = -1

    for (const candidate of candidates) {
      const score = scoreContextMatch(candidate.inputMessages, preceding)
      if (score > bestScore) {
        bestScore = score
        best = candidate
      }
    }

    if (best) messageSpanMap[i] = refOf(best)
  }

  return { messageSpanMap, toolCallSpanMap }
}
