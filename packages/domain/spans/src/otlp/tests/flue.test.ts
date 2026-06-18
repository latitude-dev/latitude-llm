import { describe, expect, it } from "vitest"
import { parseContent } from "../content/index.ts"
import type { OtlpKeyValue } from "../types.ts"

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}

const SYSTEM_PROMPT = "You are a precise translator. Return only the requested translation."

describe("parseContent (Flue)", () => {
  it("parses a model turn from flue.turn.input / flue.turn.output", () => {
    const input = {
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: 'Translate this to Spanish: "Good morning"' }] }],
      tools: [
        {
          name: "finish",
          description: "Call this tool when the task is complete.",
          parameters: { type: "object", properties: { translation: { type: "string" } }, required: ["translation"] },
        },
      ],
    }
    const output = {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call_1",
          name: "finish",
          arguments: { translation: "Buenos días", confidence: "high" },
        },
      ],
    }

    const result = parseContent([
      str("gen_ai.operation.name", "chat"),
      str("gen_ai.request.model", "gpt-4o-mini"),
      str("flue.turn.input", JSON.stringify(input)),
      str("flue.turn.output", JSON.stringify(output)),
    ])

    expect(result.systemInstructions).toEqual([{ type: "text", content: SYSTEM_PROMPT }])
    expect(result.inputMessages).toEqual([
      { role: "user", parts: [{ type: "text", content: 'Translate this to Spanish: "Good morning"' }] },
    ])
    expect(result.outputMessages).toEqual([
      {
        role: "assistant",
        parts: [
          {
            type: "tool_call",
            id: "call_1",
            name: "finish",
            arguments: { translation: "Buenos días", confidence: "high" },
          },
        ],
      },
    ])
    expect(result.toolDefinitions).toEqual([
      {
        name: "finish",
        description: "Call this tool when the task is complete.",
        parameters: { type: "object", properties: { translation: { type: "string" } }, required: ["translation"] },
      },
    ])
  })

  it("maps assistant thinking to a reasoning part and preserves text", () => {
    const output = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "The user wants a greeting." },
        { type: "text", text: "Hello there!" },
      ],
    }

    const result = parseContent([str("flue.turn.output", JSON.stringify(output))])

    expect(result.outputMessages).toEqual([
      {
        role: "assistant",
        parts: [
          { type: "reasoning", content: "The user wants a greeting." },
          { type: "text", content: "Hello there!" },
        ],
      },
    ])
  })

  it("maps prior toolCall and toolResult history into assistant and tool messages", () => {
    const input = {
      messages: [
        { role: "user", content: [{ type: "text", text: "What is 2+2?" }] },
        { role: "assistant", content: [{ type: "toolCall", id: "call_9", name: "add", arguments: { a: 2, b: 2 } }] },
        {
          role: "toolResult",
          toolCallId: "call_9",
          toolName: "add",
          content: [{ type: "text", text: "4" }],
          isError: false,
        },
      ],
    }

    const result = parseContent([str("flue.turn.input", JSON.stringify(input))])

    expect(result.inputMessages).toEqual([
      { role: "user", parts: [{ type: "text", content: "What is 2+2?" }] },
      { role: "assistant", parts: [{ type: "tool_call", id: "call_9", name: "add", arguments: { a: 2, b: 2 } }] },
      { role: "tool", parts: [{ type: "tool_call_response", id: "call_9", response: "4" }] },
    ])
  })

  it("accepts user content given as a plain string", () => {
    const input = { messages: [{ role: "user", content: "Just a string" }] }

    const result = parseContent([str("flue.turn.input", JSON.stringify(input))])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "Just a string" }] }])
  })

  it("maps inline image content to a data-uri part", () => {
    const input = {
      messages: [{ role: "user", content: [{ type: "image", data: "aGVsbG8=", mimeType: "image/png" }] }],
    }

    const result = parseContent([str("flue.turn.input", JSON.stringify(input))])

    expect(result.inputMessages).toEqual([
      { role: "user", parts: [{ type: "uri", modality: "image", uri: "data:image/png;base64,aGVsbG8=" }] },
    ])
  })

  it("degrades gracefully on malformed flue.turn.input JSON", () => {
    const output = { role: "assistant", content: [{ type: "text", text: "ok" }] }

    const result = parseContent([
      str("flue.turn.input", "{ not valid json"),
      str("flue.turn.output", JSON.stringify(output)),
    ])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "ok" }] }])
  })

  it("returns empty content when no Flue attributes are present", () => {
    const result = parseContent([str("gen_ai.operation.name", "chat")])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
    expect(result.toolDefinitions).toEqual([])
  })
})
