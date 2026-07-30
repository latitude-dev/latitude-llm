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

  it("selects a reasoning part, which the conversation UI also lets users highlight", () => {
    const thinking = "Let me check the refund policy before answering."
    const reasoningMessages: GenAIMessage[] = [{ role: "assistant", parts: [{ type: "reasoning", content: thinking }] }]

    expect(resolveAnnotationAnchorText(reasoningMessages, { messageIndex: 0, partIndex: 0 })).toBe(thinking)
  })

  it("applies offsets within a reasoning part", () => {
    const thinking = "Let me check the refund policy before answering."
    const reasoningMessages: GenAIMessage[] = [{ role: "assistant", parts: [{ type: "reasoning", content: thinking }] }]

    expect(
      resolveAnnotationAnchorText(reasoningMessages, {
        messageIndex: 0,
        partIndex: 0,
        startOffset: 12,
        endOffset: 30,
      }),
    ).toBe(thinking.slice(12, 30))
  })

  it("joins reasoning alongside text when partIndex is absent", () => {
    const mixed: GenAIMessage[] = [
      {
        role: "assistant",
        parts: [
          { type: "reasoning", content: "Thinking. " },
          { type: "text", content: "Answering." },
        ],
      },
    ]

    expect(resolveAnnotationAnchorText(mixed, { messageIndex: 0 })).toBe("Thinking. Answering.")
  })

  it("falls back to a synthesized text part when the message carries only `content`", () => {
    // `normalizeMessage` / `getPartText` in the conversation UI synthesize
    // `parts: [{ type: "text", content }]` for these and emit `partIndex: 0`.
    const contentOnly = [{ role: "assistant", content: "hello there" }] as unknown as GenAIMessage[]

    expect(
      resolveAnnotationAnchorText(contentOnly, { messageIndex: 0, partIndex: 0, startOffset: 0, endOffset: 5 }),
    ).toBe("hello")
    expect(resolveAnnotationAnchorText(contentOnly, { messageIndex: 0 })).toBe("hello there")
  })

  it("returns undefined for parts the UI cannot select", () => {
    const toolCall: GenAIMessage[] = [{ role: "assistant", parts: [{ type: "tool_call", name: "Read" }] }]

    expect(resolveAnnotationAnchorText(toolCall, { messageIndex: 0, partIndex: 0 })).toBeUndefined()
  })

  it("returns undefined when indices are out of range", () => {
    expect(
      resolveAnnotationAnchorText(messages, {
        messageIndex: 99,
        partIndex: 0,
      }),
    ).toBeUndefined()
  })

  it("returns undefined instead of throwing when the message is missing parts", () => {
    const malformed: GenAIMessage[] = [{ role: "system" } as GenAIMessage]
    expect(resolveAnnotationAnchorText(malformed, { messageIndex: 0, partIndex: 0 })).toBeUndefined()
  })

  it("returns an empty string instead of throwing when joining parts of a message missing parts", () => {
    const malformed: GenAIMessage[] = [{ role: "system" } as GenAIMessage]
    expect(resolveAnnotationAnchorText(malformed, { messageIndex: 0 })).toBe("")
  })

  it("slices against prettified JSON when textFormat is 'pretty-json'", () => {
    const raw = '[{"id":"rel-2026-17"},{"id":"rel-2026-18"}]'
    const prettified = JSON.stringify(JSON.parse(raw), null, 2)
    const jsonMessages: GenAIMessage[] = [{ role: "assistant", parts: [{ type: "text", content: raw }] }]

    // Offsets target `"id": "rel-2026-18"` inside the *prettified* text.
    const needle = '"id": "rel-2026-18"'
    const start = prettified.indexOf(needle)
    const end = start + needle.length

    expect(
      resolveAnnotationAnchorText(jsonMessages, {
        messageIndex: 0,
        partIndex: 0,
        startOffset: start,
        endOffset: end,
        textFormat: "pretty-json",
      }),
    ).toBe(needle)
  })

  it("leaves already-multiline JSON unchanged under 'pretty-json'", () => {
    const raw = '{\n  "foo": "bar"\n}'
    const jsonMessages: GenAIMessage[] = [{ role: "assistant", parts: [{ type: "text", content: raw }] }]
    expect(
      resolveAnnotationAnchorText(jsonMessages, {
        messageIndex: 0,
        partIndex: 0,
        startOffset: 0,
        endOffset: raw.length,
        textFormat: "pretty-json",
      }),
    ).toBe(raw)
  })
})
