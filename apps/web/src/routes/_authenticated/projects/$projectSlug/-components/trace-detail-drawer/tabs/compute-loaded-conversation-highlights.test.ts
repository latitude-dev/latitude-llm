import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import {
  computeLoadedConversationHighlights,
  formatConversationSearchForBackend,
} from "./compute-loaded-conversation-highlights.ts"

function textMessage(content: string): GenAIMessage {
  return { role: "assistant", parts: [{ type: "text", content }] }
}

describe("computeLoadedConversationHighlights", () => {
  it("wraps plain unquoted text for backend lexical search", () => {
    expect(formatConversationSearchForBackend("Large conversation")).toBe('"Large conversation"')
    expect(formatConversationSearchForBackend('  already "quoted"  ')).toBe('already "quoted"')
    expect(formatConversationSearchForBackend("`token phrase`")).toBe("`token phrase`")
  })

  it("highlights plain unquoted text as a literal phrase", () => {
    const messages = [textMessage("Large conversation seed 3 with more text")]
    const result = computeLoadedConversationHighlights(messages, "Large conversation")

    expect(result.firstMatchIndex).toBe(0)
    expect(result.highlights[0]).toMatchObject({
      type: "search-literal",
      startOffset: 0,
      endOffset: 18,
    })
  })
})
