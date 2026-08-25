import { describe, expect, it } from "vitest"
import { normalizeGenAIMessages } from "./normalize-genai-messages.ts"

describe("normalizeGenAIMessages", () => {
  it("rewrites a `thinking` part as the convention.s `reasoning`", () => {
    const [message] = normalizeGenAIMessages([
      { role: "assistant", parts: [{ type: "thinking", content: "deliberating" }] },
    ] as never)

    expect(message?.parts).toEqual([{ type: "reasoning", content: "deliberating" }])
  })

  it("accepts a non-conformant part that keeps its content under `thinking`", () => {
    const [message] = normalizeGenAIMessages([
      { role: "assistant", parts: [{ type: "thinking", thinking: "deliberating" }] },
    ] as never)

    expect(message?.parts).toEqual([{ type: "reasoning", content: "deliberating" }])
  })

  it("leaves a reasoning part alone", () => {
    const [message] = normalizeGenAIMessages([
      { role: "assistant", parts: [{ type: "reasoning", content: "deliberating" }] },
    ] as never)

    expect(message?.parts).toEqual([{ type: "reasoning", content: "deliberating" }])
  })

  it("rewrites the Responses API's directional text blocks as text", () => {
    const [message] = normalizeGenAIMessages([
      {
        role: "assistant",
        parts: [
          { type: "output_text", text: "one file: README.md" },
          { type: "input_text", text: "list the repo" },
        ],
      },
    ] as never)

    expect(message?.parts).toEqual([
      { type: "text", content: "one file: README.md" },
      { type: "text", content: "list the repo" },
    ])
  })

  it("rewrites a Responses `function_call`, pairing on call_id and parsing its arguments", () => {
    const [message] = normalizeGenAIMessages([
      {
        role: "assistant",
        parts: [{ type: "function_call", id: "fc_1", call_id: "call_1", name: "terminal", arguments: '{"cmd":"ls"}' }],
      },
    ] as never)

    expect(message?.parts).toEqual([{ type: "tool_call", id: "call_1", name: "terminal", arguments: { cmd: "ls" } }])
  })

  it("keeps unparseable arguments as the string they arrived as", () => {
    const [message] = normalizeGenAIMessages([
      { role: "assistant", parts: [{ type: "function_call", call_id: "c", name: "t", arguments: "not json" }] },
    ] as never)

    expect(message?.parts?.[0]).toMatchObject({ arguments: "not json" })
  })

  it("rewrites a Responses `function_call_output` and hoists it into a tool message", () => {
    const messages = normalizeGenAIMessages([
      {
        role: "assistant",
        parts: [
          { type: "output_text", text: "checking" },
          { type: "function_call_output", call_id: "call_1", output: "README.md" },
        ],
      },
    ] as never)

    expect(messages).toEqual([
      { role: "tool", parts: [{ type: "tool_call_response", id: "call_1", response: "README.md" }] },
      { role: "assistant", parts: [{ type: "text", content: "checking" }] },
    ])
  })

  it("falls back to the item id when a Responses item carries no call_id", () => {
    const [message] = normalizeGenAIMessages([
      { role: "tool", parts: [{ type: "function_call_output", id: "fc_9", output: "ok" }] },
    ] as never)

    expect(message?.parts).toEqual([{ type: "tool_call_response", id: "fc_9", response: "ok" }])
  })

  it("leaves an empty Responses text block alone rather than emitting an empty part", () => {
    const [message] = normalizeGenAIMessages([
      { role: "assistant", parts: [{ type: "output_text", text: "" }] },
    ] as never)

    expect(message?.parts).toEqual([{ type: "output_text", text: "" }])
  })

  it("moves a tool result's payload from `result` to `response`", () => {
    const [message] = normalizeGenAIMessages([
      { role: "tool", parts: [{ type: "tool_call_response", id: "c1", result: { ok: true } }] },
    ] as never)

    expect(message?.parts?.[0]).toMatchObject({ type: "tool_call_response", id: "c1", response: { ok: true } })
    expect(message?.parts?.[0]).not.toHaveProperty("result")
  })

  it("moves a tool result's name into known fields, where the UI reads it", () => {
    const [message] = normalizeGenAIMessages([
      { role: "tool", parts: [{ type: "tool_call_response", id: "c1", name: "lookup_order", result: "ok" }] },
    ] as never)

    expect(message?.parts?.[0]).toEqual({
      type: "tool_call_response",
      id: "c1",
      response: "ok",
      _provider_metadata: { _known_fields: { toolName: "lookup_order" } },
    })
  })

  it("keeps known fields that were already there", () => {
    const [message] = normalizeGenAIMessages([
      {
        role: "tool",
        parts: [
          {
            type: "tool_call_response",
            name: "lookup_order",
            result: "ok",
            _provider_metadata: { _known_fields: { isError: true } },
          },
        ],
      },
    ] as never)

    expect(message?.parts?.[0]?._provider_metadata?._known_fields).toEqual({
      isError: true,
      toolName: "lookup_order",
    })
  })

  it("prefers an existing `response` over `result`", () => {
    const [message] = normalizeGenAIMessages([
      { role: "tool", parts: [{ type: "tool_call_response", response: "kept", result: "ignored" }] },
    ] as never)

    expect(message?.parts?.[0]).toMatchObject({ response: "kept" })
  })

  it("hoists a tool result out of the turn the provider nested it in", () => {
    const messages = normalizeGenAIMessages([
      { role: "user", parts: [{ type: "tool_call_response", id: "c1", result: "ok" }] },
    ] as never)

    expect(messages.map((m) => m.role)).toEqual(["tool"])
  })

  it("splits a mixed turn, keeping the non-tool parts under the original role", () => {
    const messages = normalizeGenAIMessages([
      {
        role: "user",
        parts: [
          { type: "tool_call_response", id: "c1", result: "ok" },
          { type: "text", content: "and also this" },
        ],
      },
    ] as never)

    expect(messages.map((m) => [m.role, (m.parts ?? []).map((p) => p.type)])).toEqual([
      ["tool", ["tool_call_response"]],
      ["user", ["text"]],
    ])
  })

  it("rewrites a `binary` part as the convention.s `blob`", () => {
    const [message] = normalizeGenAIMessages([
      { role: "user", parts: [{ type: "binary", content: "aGVsbG8=", media_type: "image/png" }] },
    ] as never)

    expect(message?.parts?.[0]).toEqual({
      type: "blob",
      content: "aGVsbG8=",
      mime_type: "image/png",
      modality: "image",
    })
  })

  it("leaves a binary part with no content alone, having nothing to carry", () => {
    const [message] = normalizeGenAIMessages([{ role: "user", parts: [{ type: "binary" }] }] as never)

    expect(message?.parts?.[0]).toEqual({ type: "binary" })
  })

  it("leaves a tool_call.s own `name` in place, which the convention requires there", () => {
    const [message] = normalizeGenAIMessages([
      { role: "assistant", parts: [{ type: "tool_call", id: "c1", name: "lookup_order", arguments: {} }] },
    ] as never)

    expect(message?.parts?.[0]).toEqual({ type: "tool_call", id: "c1", name: "lookup_order", arguments: {} })
  })

  it("is idempotent", () => {
    const once = normalizeGenAIMessages([
      { role: "user", parts: [{ type: "tool_call_response", name: "t", result: "ok" }] },
      { role: "assistant", parts: [{ type: "thinking", content: "why" }] },
    ] as never)

    expect(normalizeGenAIMessages(once)).toEqual(once)
  })

  it("passes through a message with no parts array", () => {
    const messages = normalizeGenAIMessages([{ role: "user", content: "hi" }] as never)

    expect(messages).toEqual([{ role: "user", content: "hi" }])
  })
})
