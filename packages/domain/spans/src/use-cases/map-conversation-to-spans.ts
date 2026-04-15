import type { GenAIMessage } from "rosetta-ai"
import type { SpanMessagesData } from "../ports/span-repository.ts"

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

export function buildConversationSpanMaps(
  allMessages: readonly GenAIMessage[],
  spans: readonly SpanMessagesData[],
): { messageSpanMap: Record<number, string>; toolCallSpanMap: Record<string, string> } {
  // Tool call map: toolCallId → spanId (deterministic via execute_tool spans)
  const toolCallSpanMap: Record<string, string> = {}
  for (const span of spans) {
    if (span.toolCallId) {
      toolCallSpanMap[span.toolCallId] = span.spanId as string
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
  const messageSpanMap: Record<number, string> = {}
  for (let i = 0; i < allMessages.length; i++) {
    const msg = allMessages[i]
    if (!msg || msg.role !== "assistant") continue

    const fp = fingerprintMessage(msg)
    const candidates = fingerprintIndex.get(fp)
    if (!candidates || candidates.length === 0) continue

    if (candidates.length === 1) {
      const spanId = candidates[0]?.spanId as string | undefined
      if (spanId) messageSpanMap[i] = spanId
      continue
    }

    // Disambiguate by context: score each candidate's input against preceding messages
    const preceding = allMessages.slice(0, i)
    let bestSpanId = candidates[0]?.spanId as string | undefined
    let bestScore = -1

    for (const candidate of candidates) {
      const score = scoreContextMatch(candidate.inputMessages, preceding)
      if (score > bestScore) {
        bestScore = score
        bestSpanId = candidate.spanId as string | undefined
      }
    }

    if (bestSpanId) messageSpanMap[i] = bestSpanId
  }

  return { messageSpanMap, toolCallSpanMap }
}
