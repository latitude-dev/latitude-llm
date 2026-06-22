import { describe, expect, it } from "vitest"
import type { OtlpAnyValue, OtlpKeyValue } from "../types.ts"
import { parseContent } from "./index.ts"

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}

function toOtlpValue(v: unknown): OtlpAnyValue {
  if (typeof v === "string") return { stringValue: v }
  if (typeof v === "boolean") return { boolValue: v }
  if (typeof v === "number") return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toOtlpValue) } }
  if (typeof v === "object" && v !== null) {
    return { kvlistValue: { values: Object.entries(v).map(([key, val]) => ({ key, value: toOtlpValue(val) })) } }
  }
  return {}
}

function structured(key: string, value: unknown): OtlpKeyValue {
  return { key, value: toOtlpValue(value) }
}

describe("parseContent (GenAI current — gen_ai.{input,output}.messages)", () => {
  describe("dispatch", () => {
    it("handles a span carrying only gen_ai.input.messages", () => {
      const result = parseContent([
        str("gen_ai.input.messages", JSON.stringify([{ role: "user", parts: [{ type: "text", content: "hi" }] }])),
      ])

      expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "hi" }] }])
      expect(result.outputMessages).toEqual([])
    })

    it("handles a span carrying only gen_ai.output.messages", () => {
      const result = parseContent([
        str(
          "gen_ai.output.messages",
          JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: "ok" }] }]),
        ),
      ])

      expect(result.inputMessages).toEqual([])
      expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "ok" }] }])
    })
  })

  describe("input and output messages", () => {
    it("parses input and output messages from JSON-string attributes", () => {
      const result = parseContent([
        str(
          "gen_ai.input.messages",
          JSON.stringify([{ role: "user", parts: [{ type: "text", content: "What is 2+2?" }] }]),
        ),
        str("gen_ai.output.messages", JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: "4" }] }])),
      ])

      expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "What is 2+2?" }] }])
      expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "4" }] }])
    })

    it("parses messages from structured OTLP arrayValue/kvlistValue attributes", () => {
      const result = parseContent([
        structured("gen_ai.input.messages", [{ role: "user", parts: [{ type: "text", content: "structured" }] }]),
        structured("gen_ai.output.messages", [
          { role: "assistant", parts: [{ type: "text", content: "structured reply" }] },
        ]),
      ])

      expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "structured" }] }])
      expect(result.outputMessages).toEqual([
        { role: "assistant", parts: [{ type: "text", content: "structured reply" }] },
      ])
    })

    it("passes multimodal uri parts through verbatim", () => {
      const result = parseContent([
        str(
          "gen_ai.input.messages",
          JSON.stringify([
            {
              role: "user",
              parts: [
                { type: "text", content: "Look at this" },
                { type: "uri", modality: "image", uri: "https://example.com/x.jpg" },
              ],
            },
          ]),
        ),
      ])

      expect(result.inputMessages).toEqual([
        {
          role: "user",
          parts: [
            { type: "text", content: "Look at this" },
            { type: "uri", modality: "image", uri: "https://example.com/x.jpg" },
          ],
        },
      ])
    })

    it("passes reasoning parts through verbatim", () => {
      const result = parseContent([
        str(
          "gen_ai.output.messages",
          JSON.stringify([
            {
              role: "assistant",
              parts: [
                { type: "reasoning", content: "The user wants a greeting." },
                { type: "text", content: "Hello!" },
              ],
            },
          ]),
        ),
      ])

      expect(result.outputMessages).toEqual([
        {
          role: "assistant",
          parts: [
            { type: "reasoning", content: "The user wants a greeting." },
            { type: "text", content: "Hello!" },
          ],
        },
      ])
    })

    it("preserves a native tool_call part and its tool_call_response without rewriting", () => {
      const result = parseContent([
        str(
          "gen_ai.input.messages",
          JSON.stringify([
            { role: "user", parts: [{ type: "text", content: "weather?" }] },
            {
              role: "assistant",
              parts: [{ type: "tool_call", id: "c1", name: "get_weather", arguments: { city: "SF" } }],
            },
            { role: "tool", parts: [{ type: "tool_call_response", id: "c1", response: { tempC: 21 } }] },
          ]),
        ),
      ])

      expect(result.inputMessages).toEqual([
        { role: "user", parts: [{ type: "text", content: "weather?" }] },
        { role: "assistant", parts: [{ type: "tool_call", id: "c1", name: "get_weather", arguments: { city: "SF" } }] },
        { role: "tool", parts: [{ type: "tool_call_response", id: "c1", response: { tempC: 21 } }] },
      ])
    })

    it("hoists a tool-result nested in a user turn (Anthropic) into its own tool message", () => {
      const result = parseContent([
        str(
          "gen_ai.input.messages",
          JSON.stringify([
            {
              role: "assistant",
              parts: [{ type: "tool_call", id: "toolu_1", name: "get_weather", arguments: { city: "SF" } }],
            },
            { role: "user", parts: [{ type: "tool_call_response", id: "toolu_1", response: { tempC: 21 } }] },
          ]),
        ),
      ])

      expect(result.inputMessages).toEqual([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "toolu_1", name: "get_weather", arguments: { city: "SF" } }],
        },
        { role: "tool", parts: [{ type: "tool_call_response", id: "toolu_1", response: { tempC: 21 } }] },
      ])
    })

    it("splits a mixed user turn into a tool message + a user message, keeping sibling text under user", () => {
      const result = parseContent([
        str(
          "gen_ai.input.messages",
          JSON.stringify([
            {
              role: "user",
              parts: [
                { type: "tool_call_response", id: "toolu_1", response: { tempC: 21 } },
                { type: "text", content: "thanks, now in Celsius please" },
              ],
            },
          ]),
        ),
      ])

      expect(result.inputMessages).toEqual([
        { role: "tool", parts: [{ type: "tool_call_response", id: "toolu_1", response: { tempC: 21 } }] },
        { role: "user", parts: [{ type: "text", content: "thanks, now in Celsius please" }] },
      ])
    })

    it("passes unknown roles and unknown part types through verbatim", () => {
      const result = parseContent([
        str("gen_ai.input.messages", JSON.stringify([{ role: "weirdo", parts: [{ type: "mystery", foo: "bar" }] }])),
      ])

      expect(result.inputMessages).toEqual([{ role: "weirdo", parts: [{ type: "mystery", foo: "bar" }] }])
    })
  })

  describe("litellm hybrid normalization", () => {
    it("rewrites an OpenAI-native tool_calls array into tool_call parts", () => {
      const result = parseContent([
        str(
          "gen_ai.input.messages",
          JSON.stringify([
            {
              role: "assistant",
              parts: [],
              tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: '{"a":1}' } }],
            },
          ]),
        ),
      ])

      expect(result.inputMessages).toEqual([
        { role: "assistant", parts: [{ type: "tool_call", id: "c1", name: "f", arguments: { a: 1 } }] },
      ])
      expect((result.inputMessages[0] as Record<string, unknown>).tool_calls).toBeUndefined()
    })

    it("keeps non-JSON tool_call arguments as a raw string", () => {
      const result = parseContent([
        str(
          "gen_ai.input.messages",
          JSON.stringify([
            {
              role: "assistant",
              parts: [],
              tool_calls: [{ id: "c2", function: { name: "f", arguments: "not json" } }],
            },
          ]),
        ),
      ])

      expect(result.inputMessages).toEqual([
        { role: "assistant", parts: [{ type: "tool_call", id: "c2", name: "f", arguments: "not json" }] },
      ])
    })

    it("defaults a missing tool_call id to null", () => {
      const result = parseContent([
        str(
          "gen_ai.input.messages",
          JSON.stringify([
            { role: "assistant", parts: [], tool_calls: [{ function: { name: "f", arguments: { x: 1 } } }] },
          ]),
        ),
      ])

      expect(result.inputMessages).toEqual([
        { role: "assistant", parts: [{ type: "tool_call", id: null, name: "f", arguments: { x: 1 } }] },
      ])
    })

    it("rewrites a top-level tool_call_id with text parts into a tool_call_response part", () => {
      const result = parseContent([
        str(
          "gen_ai.input.messages",
          JSON.stringify([{ role: "tool", tool_call_id: "c9", parts: [{ type: "text", content: '{"ok":true}' }] }]),
        ),
      ])

      expect(result.inputMessages).toEqual([
        { role: "tool", parts: [{ type: "tool_call_response", id: "c9", response: { ok: true } }] },
      ])
      expect((result.inputMessages[0] as Record<string, unknown>).tool_call_id).toBeUndefined()
    })

    it("keeps a non-JSON tool result response as a raw string", () => {
      const result = parseContent([
        str(
          "gen_ai.input.messages",
          JSON.stringify([{ role: "tool", tool_call_id: "c9", parts: [{ type: "text", content: "plain text" }] }]),
        ),
      ])

      expect(result.inputMessages).toEqual([
        { role: "tool", parts: [{ type: "tool_call_response", id: "c9", response: "plain text" }] },
      ])
    })

    it("does not re-normalize a message that already carries a tool_call part", () => {
      const result = parseContent([
        str(
          "gen_ai.input.messages",
          JSON.stringify([
            {
              role: "assistant",
              parts: [{ type: "tool_call", id: "existing", name: "g", arguments: {} }],
              tool_calls: [{ id: "ignored", function: { name: "f", arguments: "{}" } }],
            },
          ]),
        ),
      ])

      const parts = (result.inputMessages[0] as { parts: { type: string }[] }).parts
      expect(parts).toEqual([{ type: "tool_call", id: "existing", name: "g", arguments: {} }])
    })
  })

  describe("system instructions", () => {
    it("parses gen_ai.system_instructions from a JSON-string array", () => {
      const result = parseContent([
        str("gen_ai.output.messages", JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: "x" }] }])),
        str("gen_ai.system_instructions", JSON.stringify([{ type: "text", content: "You are helpful." }])),
      ])

      expect(result.systemInstructions).toEqual([{ type: "text", content: "You are helpful." }])
    })

    it("parses gen_ai.system_instructions from a structured OTLP array", () => {
      const result = parseContent([
        str("gen_ai.output.messages", JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: "x" }] }])),
        structured("gen_ai.system_instructions", [{ type: "text", content: "Be terse." }]),
      ])

      expect(result.systemInstructions).toEqual([{ type: "text", content: "Be terse." }])
    })

    it("returns empty system instructions when the value is not an array", () => {
      const result = parseContent([
        str("gen_ai.output.messages", JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: "x" }] }])),
        str("gen_ai.system_instructions", JSON.stringify("just a string")),
      ])

      expect(result.systemInstructions).toEqual([])
    })

    it("returns empty system instructions when the attribute is absent", () => {
      const result = parseContent([
        str("gen_ai.output.messages", JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: "x" }] }])),
      ])

      expect(result.systemInstructions).toEqual([])
    })
  })

  describe("tool definitions", () => {
    it("normalizes wrapped and flat tool definitions and drops invalid entries", () => {
      const result = parseContent([
        str("gen_ai.input.messages", JSON.stringify([{ role: "user", parts: [{ type: "text", content: "hi" }] }])),
        str(
          "gen_ai.output.messages",
          JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: "ok" }] }]),
        ),
        str(
          "gen_ai.tool.definitions",
          JSON.stringify([
            { type: "function", function: { name: "wrapped", description: "wd", parameters: { a: 1 } } },
            { name: "flat", description: "fd", parameters: { b: 2 } },
            { noName: true },
            "garbage",
          ]),
        ),
      ])

      expect(result.toolDefinitions).toEqual([
        { name: "wrapped", description: "wd", parameters: { a: 1 } },
        { name: "flat", description: "fd", parameters: { b: 2 } },
      ])
    })

    it("defaults a missing tool description to an empty string", () => {
      const result = parseContent([
        str("gen_ai.input.messages", JSON.stringify([{ role: "user", parts: [{ type: "text", content: "hi" }] }])),
        str(
          "gen_ai.output.messages",
          JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: "ok" }] }]),
        ),
        str("gen_ai.tool.definitions", JSON.stringify([{ name: "no_desc", parameters: { type: "object" } }])),
      ])

      expect(result.toolDefinitions).toEqual([{ name: "no_desc", description: "", parameters: { type: "object" } }])
    })

    it("returns empty tool definitions when the value is not an array", () => {
      const result = parseContent([
        str("gen_ai.input.messages", JSON.stringify([{ role: "user", parts: [{ type: "text", content: "hi" }] }])),
        str(
          "gen_ai.output.messages",
          JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: "ok" }] }]),
        ),
        str("gen_ai.tool.definitions", JSON.stringify({ name: "single" })),
      ])

      expect(result.toolDefinitions).toEqual([])
    })
  })

  describe("malformed and empty payloads", () => {
    it("degrades to empty input on malformed gen_ai.input.messages JSON while keeping output", () => {
      const result = parseContent([
        str("gen_ai.input.messages", "{ not valid json"),
        str(
          "gen_ai.output.messages",
          JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: "ok" }] }]),
        ),
      ])

      expect(result.inputMessages).toEqual([])
      expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "ok" }] }])
    })

    it("returns empty messages when gen_ai.input.messages is a non-array JSON value", () => {
      const result = parseContent([str("gen_ai.input.messages", JSON.stringify({ role: "user" }))])

      expect(result.inputMessages).toEqual([])
    })

    it("returns empty messages for an empty input array", () => {
      const result = parseContent([
        str("gen_ai.input.messages", JSON.stringify([])),
        str(
          "gen_ai.output.messages",
          JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: "ok" }] }]),
        ),
      ])

      expect(result.inputMessages).toEqual([])
      expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "ok" }] }])
    })
  })

  describe("deprecated-attribute fallback", () => {
    it("recovers input messages and system instructions from gen_ai.prompt.* when input.messages is contentless", () => {
      const result = parseContent([
        str("gen_ai.input.messages", JSON.stringify([{ role: "user", parts: [] }])),
        str(
          "gen_ai.output.messages",
          JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: "ok" }] }]),
        ),
        str("gen_ai.prompt.0.role", "system"),
        str("gen_ai.prompt.0.content", "You are helpful."),
        str("gen_ai.prompt.1.role", "user"),
        str("gen_ai.prompt.1.content", "Hi there."),
      ])

      const user = result.inputMessages.find((m) => m.role === "user")
      expect(user).toBeDefined()
      const parts = (user as { parts: { type: string; content?: string }[] }).parts
      expect((parts.find((p) => p.type === "text") as { content: string }).content).toBe("Hi there.")
      expect(result.systemInstructions.length).toBeGreaterThan(0)
    })

    it("recovers the tool call into a contentless assistant output message from deprecated function_call attrs", () => {
      const result = parseContent([
        str(
          "gen_ai.input.messages",
          JSON.stringify([{ role: "user", parts: [{ type: "text", content: "weather in SF?" }] }]),
        ),
        str("gen_ai.output.messages", JSON.stringify([{ role: "assistant", parts: [] }])),
        str("gen_ai.completion.0.function_call.name", "get_weather"),
        str("gen_ai.completion.0.function_call.arguments", '{"city":"San Francisco"}'),
      ])

      const assistant = result.outputMessages.find((m) => m.role === "assistant")
      expect(assistant).toBeDefined()
      const parts = (assistant as { parts: { type: string; name?: string }[] }).parts
      const toolCall = parts.find((p) => p.type === "tool_call")
      expect(toolCall).toBeDefined()
      expect((toolCall as { name: string }).name).toBe("get_weather")
    })

    it("recovers tool definitions from indexed llm.request.functions.* when gen_ai.tool.definitions is absent", () => {
      const result = parseContent([
        str("gen_ai.input.messages", JSON.stringify([{ role: "user", parts: [{ type: "text", content: "hi" }] }])),
        str(
          "gen_ai.output.messages",
          JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: "ok" }] }]),
        ),
        str("llm.request.functions.0.name", "get_weather"),
        str("llm.request.functions.0.description", "Get the current weather for a city"),
        str("llm.request.functions.0.parameters", '{"type":"object","properties":{"city":{"type":"string"}}}'),
      ])

      expect(result.toolDefinitions).toEqual([
        {
          name: "get_weather",
          description: "Get the current weather for a city",
          parameters: { type: "object", properties: { city: { type: "string" } } },
        },
      ])
    })

    it("does not override a content-bearing output message with stale deprecated attrs", () => {
      const result = parseContent([
        str(
          "gen_ai.output.messages",
          JSON.stringify([{ role: "assistant", parts: [{ type: "text", content: "It is sunny." }] }]),
        ),
        str("gen_ai.completion.0.function_call.name", "get_weather"),
        str("gen_ai.completion.0.function_call.arguments", '{"city":"SF"}'),
      ])

      const assistant = result.outputMessages.find((m) => m.role === "assistant")
      const parts = (assistant as { parts: { type: string; content?: string }[] }).parts
      expect(parts.some((p) => p.type === "tool_call")).toBe(false)
      expect((parts.find((p) => p.type === "text") as { content: string }).content).toBe("It is sunny.")
    })
  })
})
