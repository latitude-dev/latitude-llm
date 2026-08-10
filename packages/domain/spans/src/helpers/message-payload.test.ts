import { describe, expect, it } from "vitest"
import { extractMessages, parseMessagePayload, stringifyPayload } from "./message-payload.ts"

const SYSTEM_META = { _provider_metadata: { _known_fields: { messageIndex: 0 } } }

describe("extractMessages", () => {
  it.each([
    ["a bare array", [{ role: "user", content: "hi" }]],
    ["a JSON-encoded array", JSON.stringify([{ role: "user", content: "hi" }])],
    ["a messages container", { messages: [{ role: "user", content: "hi" }] }],
    ["a JSON-encoded messages container", JSON.stringify({ messages: [{ role: "user", content: "hi" }] })],
  ])("reads messages out of %s", (_label, payload) => {
    expect(extractMessages(payload)).toEqual([{ role: "user", content: "hi" }])
  })

  // A lone object is a conversation only to a trace import, whose alternative is rendering the
  // payload as text. To OTEL's `input.value` it is any object that happens to carry a `role`
  // key, so widening this primitive turned an authorization blob into a message with
  // `role: "admin"`. The widening lives in `parseMessagePayload` instead.
  it.each([
    ["a lone message object", { role: "user", content: "hi" }],
    ["a role-bearing object that is not a message", { role: "admin", user: "bob" }],
  ])("does not treat %s as a conversation", (_label, payload) => {
    expect(extractMessages(payload)).toBeUndefined()
  })

  // The rule the callers depend on: anything that is not unambiguously a conversation has to
  // come back undefined, so each of them can apply its own policy to the raw payload instead.
  it.each([
    ["an object with no messages", { city: "Barcelona" }],
    ["an array entry with no role", [{ content: "no role here" }]],
    ["an array only partly made of messages", [null, 1, { role: "assistant" }]],
    ["an array of scalars", ["a", "b"]],
    ["an empty array", []],
    ["an empty messages container", { messages: [] }],
    ["a plain sentence", "just some text"],
    ["malformed JSON", "{ not json"],
    ["nothing", undefined],
    ["null", null],
  ])("rejects %s", (_label, payload) => {
    expect(extractMessages(payload)).toBeUndefined()
  })
})

describe("parseMessagePayload", () => {
  // The import-side widening of the strict primitive above: a source records one turn per side,
  // so `{ role, content }` is the common shape rather than an ambiguous one.
  it("accepts a lone message object on either side", () => {
    const result = parseMessagePayload({
      input: { role: "user", content: "hi" },
      output: { role: "assistant", content: "hello" },
    })

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "hi" }] }])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "hello" }] }])
  })

  it("translates each side on its own when both carry messages", () => {
    const result = parseMessagePayload({
      input: [
        { role: "system", content: "be brief" },
        { role: "user", content: "2+2?" },
      ],
      output: [{ role: "assistant", content: "4" }],
    })

    expect(result.systemInstructions).toEqual([{ type: "text", content: "be brief", ...SYSTEM_META }])
    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "2+2?" }] }])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "4" }] }])
  })

  it.each([
    ["output", (messages: unknown) => ({ input: undefined, output: messages })],
    ["input", (messages: unknown) => ({ input: messages, output: undefined })],
  ])("splits a whole exchange recorded on %s alone", (_side, build) => {
    const result = parseMessagePayload(
      build([
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ]),
    )

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "Hi" }] }])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "Hello" }] }])
  })

  it("does not split when the other side carries content of its own", () => {
    const result = parseMessagePayload({
      input: { question: "2+2?" },
      output: [
        { role: "user", content: "2+2?" },
        { role: "assistant", content: "4" },
      ],
    })

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: '{"question":"2+2?"}' }] }])
    expect(result.outputMessages).toEqual([
      { role: "user", parts: [{ type: "text", content: "2+2?" }] },
      { role: "assistant", parts: [{ type: "text", content: "4" }] },
    ])
  })

  it("keeps an unstructured payload as text under each side's own role", () => {
    const result = parseMessagePayload({ input: { question: "2+2?" }, output: "four" })

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: '{"question":"2+2?"}' }] }])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "four" }] }])
  })

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["an empty string", "   "],
    ["an empty object", {}],
    ["an empty array", []],
  ])("contributes no messages for %s", (_label, payload) => {
    const result = parseMessagePayload({ input: payload, output: payload })

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
  })

  // A message carrying both spellings infers as GenAI on the strength of `parts` alone, and a
  // GenAI-to-GenAI translation then keeps the empty array it arrived with — dropping the `content`
  // that held the text. litellm emits this envelope, and it reaches here whenever a source records
  // it as the span's payload.
  describe("a message carrying content beside an empty parts array", () => {
    it("reads the content the empty parts would have discarded", () => {
      const result = parseMessagePayload({
        input: [{ role: "user", content: "hi", parts: [] }],
        output: [{ role: "assistant", content: "hello", parts: [] }],
      })

      expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "hi" }] }])
      expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "hello" }] }])
    })

    it("reads the tool calls litellm keeps beside them", () => {
      const result = parseMessagePayload({
        input: undefined,
        output: [
          {
            role: "assistant",
            content: null,
            parts: [],
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "lookup_order", arguments: '{"id":"A-1"}' } },
            ],
          },
        ],
      })

      expect(result.outputMessages).toEqual([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call_1", name: "lookup_order", arguments: { id: "A-1" } }],
        },
      ])
    })

    it("leaves a GenAI turn that legitimately carries no parts alone", () => {
      const result = parseMessagePayload({ input: undefined, output: [{ role: "assistant", parts: [] }] })

      expect(result.outputMessages).toEqual([{ role: "assistant", parts: [] }])
    })
  })
})

describe("stringifyPayload", () => {
  it.each([
    ["a string verbatim", "already text", "already text"],
    ["a number", 42, "42"],
    ["a boolean", false, "false"],
    ["an object as JSON", { a: 1 }, '{"a":1}'],
    ["nothing as empty", undefined, ""],
    ["null as empty", null, ""],
  ])("renders %s", (_label, value, expected) => {
    expect(stringifyPayload(value)).toBe(expected)
  })

  it("survives a value JSON cannot encode", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(stringifyPayload(circular)).toBe("")
  })
})
