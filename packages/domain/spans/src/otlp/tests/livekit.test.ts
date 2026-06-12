import { describe, expect, it } from "vitest"
import { parseContent } from "../content/index.ts"
import type { OtlpKeyValue } from "../types.ts"

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}

const SYSTEM_PROMPT = "You are a helpful voice assistant."
const USER_TEXT = "What's the weather in Barcelona?"
const IMAGE_URL = "https://example.com/photo.jpg"
const FINAL_RESPONSE = "It's 22°C and sunny in Barcelona."

const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather for a city",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    },
  },
]

describe("parseContent (LiveKit)", () => {
  it("parses chat_ctx messages, system instructions, images, response text and tool definitions", () => {
    const chatCtx = {
      items: [
        { type: "message", role: "system", content: [SYSTEM_PROMPT] },
        {
          type: "message",
          role: "user",
          content: [USER_TEXT, { type: "image_content", image: IMAGE_URL }],
        },
      ],
    }

    const result = parseContent([
      str("gen_ai.operation.name", "chat"),
      str("gen_ai.request.model", "gpt-4o"),
      str("lk.chat_ctx", JSON.stringify(chatCtx)),
      str("lk.response.text", FINAL_RESPONSE),
      str("lk.function_tools", JSON.stringify(TOOL_DEFS)),
    ])

    expect(result.systemInstructions).toEqual([{ type: "text", content: SYSTEM_PROMPT }])
    expect(result.inputMessages).toEqual([
      {
        role: "user",
        parts: [
          { type: "text", content: USER_TEXT },
          { type: "uri", modality: "image", uri: IMAGE_URL },
        ],
      },
    ])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: FINAL_RESPONSE }] }])
    expect(result.toolDefinitions).toEqual([
      {
        name: "get_weather",
        description: "Get current weather for a city",
        parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
      },
    ])
  })

  it("maps function calls and function call outputs from chat_ctx to tool messages", () => {
    const chatCtx = {
      items: [
        { type: "message", role: "user", content: ["Book a hotel"] },
        { type: "function_call", call_id: "call_1", name: "book_hotel", arguments: '{"city":"Barcelona"}' },
        { type: "function_call_output", call_id: "call_1", name: "book_hotel", output: "No rooms available" },
      ],
    }

    const result = parseContent([str("lk.chat_ctx", JSON.stringify(chatCtx))])

    expect(result.inputMessages).toEqual([
      { role: "user", parts: [{ type: "text", content: "Book a hotel" }] },
      {
        role: "assistant",
        parts: [{ type: "tool_call", id: "call_1", name: "book_hotel", arguments: { city: "Barcelona" } }],
      },
      { role: "tool", parts: [{ type: "tool_call_response", id: "call_1", response: "No rooms available" }] },
    ])
  })

  it("parses response function_calls into an assistant tool-call message", () => {
    const functionCalls = [{ call_id: "call_2", name: "get_weather", arguments: '{"city":"Barcelona"}' }]

    const result = parseContent([
      str("lk.response.text", "Let me check that for you."),
      str("lk.response.function_calls", JSON.stringify(functionCalls)),
    ])

    expect(result.outputMessages).toEqual([
      {
        role: "assistant",
        parts: [
          { type: "text", content: "Let me check that for you." },
          { type: "tool_call", id: "call_2", name: "get_weather", arguments: { city: "Barcelona" } },
        ],
      },
    ])
  })

  it("treats the developer role as system instructions and preserves assistant history", () => {
    const chatCtx = {
      items: [
        { type: "message", role: "developer", content: ["Stay concise."] },
        { type: "message", role: "user", content: ["Hi"] },
        { type: "message", role: "assistant", content: ["Hello, how can I help?"] },
      ],
    }

    const result = parseContent([str("lk.chat_ctx", JSON.stringify(chatCtx))])

    expect(result.systemInstructions).toEqual([{ type: "text", content: "Stay concise." }])
    expect(result.inputMessages).toEqual([
      { role: "user", parts: [{ type: "text", content: "Hi" }] },
      { role: "assistant", parts: [{ type: "text", content: "Hello, how can I help?" }] },
    ])
  })

  it("maps audio transcripts and plain-string content to text parts", () => {
    const chatCtx = {
      items: [
        { type: "message", role: "user", content: "Just a string" },
        {
          type: "message",
          role: "user",
          content: [{ type: "audio_content", transcript: "spoken question" }],
        },
      ],
    }

    const result = parseContent([str("lk.chat_ctx", JSON.stringify(chatCtx))])

    expect(result.inputMessages).toEqual([
      { role: "user", parts: [{ type: "text", content: "Just a string" }] },
      { role: "user", parts: [{ type: "text", content: "spoken question" }] },
    ])
  })

  it("extracts tool definitions from a span carrying only lk.function_tools", () => {
    const result = parseContent([str("lk.function_tools", JSON.stringify(TOOL_DEFS))])

    expect(result.toolDefinitions).toEqual([
      {
        name: "get_weather",
        description: "Get current weather for a city",
        parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
      },
    ])
    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([])
  })

  it("degrades gracefully on malformed lk.chat_ctx JSON", () => {
    const result = parseContent([str("lk.chat_ctx", "{ not valid json"), str("lk.response.text", "ok")])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "ok" }] }])
  })

  it("returns empty content when no LiveKit attributes are present", () => {
    const result = parseContent([str("gen_ai.operation.name", "chat")])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
    expect(result.toolDefinitions).toEqual([])
  })
})
