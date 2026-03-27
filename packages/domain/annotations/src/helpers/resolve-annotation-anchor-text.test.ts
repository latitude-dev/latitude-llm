import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import { resolveAnnotationAnchorText } from "./resolve-annotation-anchor-text.ts"

const messages: GenAIMessage[] = [
  { role: "user", parts: [{ type: "text", content: "hello" }] },
  {
    role: "assistant",
    parts: [
      { type: "text", content: "The refund policy says no returns." },
      { type: "text", content: " Second part." },
    ],
  },
]

describe("resolveAnnotationAnchorText", () => {
  it("returns undefined when messageIndex is absent", () => {
    expect(resolveAnnotationAnchorText(messages, { messageIndex: undefined })).toBeUndefined()
  })

  it("joins all text parts when partIndex is absent", () => {
    const anchor = {
      messageIndex: 1,
    } as const
    expect(resolveAnnotationAnchorText(messages, anchor)).toBe("The refund policy says no returns. Second part.")
  })

  it("selects a single part when partIndex is set", () => {
    expect(
      resolveAnnotationAnchorText(messages, {
        messageIndex: 1,
        partIndex: 0,
      }),
    ).toBe("The refund policy says no returns.")
  })

  it("applies start/end offsets within the selected text", () => {
    const text = "The refund policy says no returns."
    expect(
      resolveAnnotationAnchorText(messages, {
        messageIndex: 1,
        partIndex: 0,
        startOffset: 4,
        endOffset: 10,
      }),
    ).toBe(text.slice(4, 10))
  })

  it("returns undefined when indices are out of range", () => {
    expect(
      resolveAnnotationAnchorText(messages, {
        messageIndex: 99,
        partIndex: 0,
      }),
    ).toBeUndefined()
  })
})
