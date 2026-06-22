import { describe, expect, it } from "vitest"
import type { OtlpKeyValue } from "../types.ts"
import { parseContent } from "./index.ts"

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}

const SYSTEM_META = { _provider_metadata: { _known_fields: { messageIndex: 0 } } }

describe("parseContent (json-value)", () => {
  it("parses separate input.value / output.value objects holding a messages array", () => {
    const input = {
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hi there" },
      ],
    }
    const output = { messages: [{ role: "assistant", content: "Hello!" }] }

    const result = parseContent([
      str("gen_ai.operation.name", "chat"),
      str("gen_ai.request.model", "gpt-4o-mini"),
      str("input.value", JSON.stringify(input)),
      str("output.value", JSON.stringify(output)),
    ])

    expect(result.systemInstructions).toEqual([{ type: "text", content: "You are helpful.", ...SYSTEM_META }])
    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "Hi there" }] }])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "Hello!" }] }])
    expect(result.toolDefinitions).toEqual([])
  })

  it("parses separate input.value / output.value bare message arrays", () => {
    const result = parseContent([
      str("input.value", JSON.stringify([{ role: "user", content: "What is 2+2?" }])),
      str("output.value", JSON.stringify([{ role: "assistant", content: "4" }])),
    ])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "What is 2+2?" }] }])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "4" }] }])
    expect(result.systemInstructions).toEqual([])
  })

  it("splits a combined CrewAI conversation in output.value, taking the trailing assistant turn as output", () => {
    const conversation = [
      { role: "system", content: "You are Weather Reporter." },
      { role: "user", content: "What's the weather in SF? Use the get_weather tool." },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"SF"}' } }],
      },
      { role: "tool", content: '{"city":"SF","temperatureC":21}', tool_call_id: "call_1", name: "get_weather" },
      { role: "assistant", content: "The weather in SF is sunny, 21C." },
    ]

    const result = parseContent([str("output.value", JSON.stringify({ raw: "...", messages: conversation }))])

    expect(result.systemInstructions).toEqual([{ type: "text", content: "You are Weather Reporter.", ...SYSTEM_META }])
    expect(result.inputMessages).toEqual([
      { role: "user", parts: [{ type: "text", content: "What's the weather in SF? Use the get_weather tool." }] },
      {
        role: "assistant",
        parts: [
          { type: "text", content: "" },
          { type: "tool_call", id: "call_1", name: "get_weather", arguments: { city: "SF" } },
        ],
      },
      {
        role: "tool",
        parts: [{ type: "tool_call_response", id: "call_1", response: '{"city":"SF","temperatureC":21}' }],
      },
    ])
    expect(result.outputMessages).toEqual([
      { role: "assistant", parts: [{ type: "text", content: "The weather in SF is sunny, 21C." }] },
    ])
  })

  it("treats a combined conversation whose last turn is the assistant as a split (no separate output.value)", () => {
    const result = parseContent([
      str(
        "input.value",
        JSON.stringify([
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello back" },
        ]),
      ),
    ])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "Hi" }] }])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "Hello back" }] }])
    expect(result.systemInstructions).toEqual([])
  })

  it("keeps a combined conversation entirely as input when the last turn is not the assistant", () => {
    const input = {
      messages: [
        { role: "system", content: "Sys" },
        { role: "user", content: "Hello" },
      ],
    }

    const result = parseContent([str("input.value", JSON.stringify(input))])

    expect(result.systemInstructions).toEqual([{ type: "text", content: "Sys", ...SYSTEM_META }])
    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "Hello" }] }])
    expect(result.outputMessages).toEqual([])
  })

  it("keeps a combined conversation as input when the last turn is a tool result", () => {
    const result = parseContent([
      str(
        "input.value",
        JSON.stringify([
          { role: "user", content: "Hi" },
          {
            role: "assistant",
            content: "",
            tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: "{}" } }],
          },
          { role: "tool", content: "res", tool_call_id: "c1", name: "f" },
        ]),
      ),
    ])

    expect(result.inputMessages).toEqual([
      { role: "user", parts: [{ type: "text", content: "Hi" }] },
      {
        role: "assistant",
        parts: [
          { type: "text", content: "" },
          { type: "tool_call", id: "c1", name: "f", arguments: {} },
        ],
      },
      { role: "tool", parts: [{ type: "tool_call_response", id: "c1", response: "res" }] },
    ])
    expect(result.outputMessages).toEqual([])
  })

  it("maps OpenAI-style multimodal user content into text + blob parts", () => {
    const result = parseContent([
      str(
        "input.value",
        JSON.stringify([
          {
            role: "user",
            content: [
              { type: "text", text: "What is in this image?" },
              { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
            ],
          },
        ]),
      ),
    ])

    expect(result.inputMessages).toEqual([
      {
        role: "user",
        parts: [
          { type: "text", content: "What is in this image?" },
          { type: "blob", modality: "image", mime_type: "image/png", content: "aGVsbG8=" },
        ],
      },
    ])
  })

  it("extracts only system instructions when the input is a lone system message", () => {
    const result = parseContent([str("input.value", JSON.stringify([{ role: "system", content: "Only system here" }]))])

    expect(result.systemInstructions).toEqual([{ type: "text", content: "Only system here", ...SYSTEM_META }])
    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([])
  })

  it("translates output.value while ignoring an empty input.value array", () => {
    const result = parseContent([
      str("input.value", JSON.stringify([])),
      str("output.value", JSON.stringify([{ role: "assistant", content: "hi" }])),
    ])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "hi" }] }])
  })

  it("degrades gracefully when both input.value and output.value are malformed JSON", () => {
    const result = parseContent([str("input.value", "{ not json"), str("output.value", "also not json")])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
    expect(result.toolDefinitions).toEqual([])
  })

  it("returns empty content for empty messages arrays", () => {
    const result = parseContent([
      str("input.value", JSON.stringify({ messages: [] })),
      str("output.value", JSON.stringify([])),
    ])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
  })

  it("returns empty content when the JSON object has no messages array", () => {
    const result = parseContent([
      str("input.value", JSON.stringify({ city: "Barcelona" })),
      str("output.value", JSON.stringify({ temp: 22 })),
    ])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
  })

  it("returns empty content when an array entry is missing a string role", () => {
    const result = parseContent([str("input.value", JSON.stringify([{ content: "no role here" }]))])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
  })

  it("returns empty content when neither input.value nor output.value is present", () => {
    const result = parseContent([str("gen_ai.operation.name", "chat")])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
    expect(result.toolDefinitions).toEqual([])
  })
})
