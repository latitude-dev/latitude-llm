import { type SessionDetail, sessionConversationMessages } from "@domain/spans"
import { hash } from "@repo/utils"
import { Effect } from "effect"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { isRecord, iterMessageParts } from "./flagger-strategies/shared.ts"

// Structurally satisfied by TraceDetail (drain path, eval harness) and built
// from SessionDetail by buildFlaggerSessionContext.
export interface FlaggerConversation {
  readonly allMessages: readonly GenAIMessage[]
  readonly outputMessages: readonly GenAIMessage[]
  readonly systemInstructions: GenAISystem
  readonly tags: readonly string[]
  readonly tokensInput: number
  readonly tokensCacheRead: number
  readonly tokensCacheCreate: number
  /** Session-union of tool names declared on any span. Absent or empty means the toolset was not reported. */
  readonly definedTools?: readonly string[]
}

export interface FlaggerSessionContext {
  readonly session: SessionDetail
  readonly latestTraceId: string // latest output-producing trace — the score row's trace anchor
  readonly conversation: FlaggerConversation
}

export const buildFlaggerSessionContext = (session: SessionDetail, latestTraceId: string): FlaggerSessionContext => ({
  session,
  latestTraceId,
  conversation: {
    allMessages: sessionConversationMessages(session),
    outputMessages: session.outputMessages,
    systemInstructions: session.systemInstructions,
    tags: session.tags,
    tokensInput: session.tokensInput,
    tokensCacheRead: session.tokensCacheRead,
    tokensCacheCreate: session.tokensCacheCreate,
    definedTools: session.definedTools,
  },
})

const messageAnchorText = (message: GenAIMessage): string => {
  const chunks: string[] = []
  for (const part of iterMessageParts(message.parts)) {
    if (!isRecord(part)) continue
    if (part.type === "text" && typeof part.content === "string") {
      chunks.push(part.content)
      continue
    }
    if (part.type === "tool_call") {
      const name = typeof part.name === "string" ? part.name : ""
      let args = ""
      try {
        args = part.arguments === undefined ? "" : JSON.stringify(part.arguments)
      } catch {
        args = ""
      }
      chunks.push(`tool_call:${name}:${args}`)
      continue
    }
    if (part.type === "tool_call_response") {
      try {
        chunks.push(`tool_result:${part.response === undefined ? "" : JSON.stringify(part.response)}`)
      } catch {
        chunks.push("tool_result:")
      }
    }
  }
  return `${message.role}\0${chunks.join("\n").replace(/\s+/g, " ").trim()}`
}

const resolveAnchoredMessage = (
  conversation: FlaggerConversation,
  messageIndex: number | undefined,
): GenAIMessage | null => {
  const messages = conversation.allMessages
  if (messageIndex !== undefined && messageIndex >= 0 && messageIndex < messages.length) {
    return messages[messageIndex] ?? null
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "assistant") return messages[i]!
  }
  return messages[messages.length - 1] ?? null
}

/**
 * Content hash of the message a flag anchors to (the flag's `messageIndex`
 * message; the last assistant message when no index was produced). Hashing the
 * anchored message's *content* — not its index — keeps the dedup key stable
 * when a mid-session compaction renumbers the window, and lets one flagger
 * legitimately flag several distinct parts of a long conversation.
 */
export const computeFlaggerAnchorContentHash = (
  conversation: FlaggerConversation,
  messageIndex: number | undefined,
): Effect.Effect<string> => {
  const anchored = resolveAnchoredMessage(conversation, messageIndex)
  const content = anchored ? messageAnchorText(anchored) : ""
  return hash(`flagger-anchor\0${content}`).pipe(Effect.catch(() => Effect.succeed(`raw:${content.slice(0, 256)}`)))
}
