import { describe, expect, it } from "vitest"
import type { OtlpKeyValue } from "../types.ts"
import { parseContent } from "./index.ts"

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}

describe("parseContent (OpenInference)", () => {
  describe("dispatch", () => {
    it("returns empty content when no recognizable attributes are present", () => {
      const result = parseContent([str("gen_ai.operation.name", "chat")])

      expect(result.inputMessages).toEqual([])
      expect(result.outputMessages).toEqual([])
      expect(result.systemInstructions).toEqual([])
      expect(result.toolDefinitions).toEqual([])
    })

    it("handles a span with only openinference.span.kind + an llm.* key (no messages)", () => {
      const result = parseContent([str("openinference.span.kind", "LLM"), str("llm.model_name", "gpt-4o")])

      expect(result.inputMessages).toEqual([])
      expect(result.outputMessages).toEqual([])
      expect(result.systemInstructions).toEqual([])
      expect(result.toolDefinitions).toEqual([])
    })

    it("is preferred over the json-value parser when llm.input_messages.* and input.value coexist", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.content", "from openinference"),
        str("input.value", JSON.stringify([{ role: "user", content: "from json-value" }])),
      ])

      expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "from openinference" }] }])
    })
  })

  describe("input messages", () => {
    it("parses a plain text user message", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.content", "Hello world"),
      ])

      expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "Hello world" }] }])
    })

    it("hoists a system message into systemInstructions", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "system"),
        str("llm.input_messages.0.message.content", "You are helpful."),
        str("llm.input_messages.1.message.role", "user"),
        str("llm.input_messages.1.message.content", "Hi"),
      ])

      expect(result.systemInstructions).toHaveLength(1)
      expect(result.systemInstructions[0]).toMatchObject({ type: "text", content: "You are helpful." })
      expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "Hi" }] }])
    })

    it("defaults a message with no role to 'user'", () => {
      const result = parseContent([str("llm.input_messages.0.message.content", "no role here")])

      expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "no role here" }] }])
    })

    it("drops a message that carries no content", () => {
      const result = parseContent([str("llm.input_messages.0.message.role", "user")])

      expect(result.inputMessages).toEqual([])
    })

    it("drops a message whose content is blank", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.content", "hi"),
        str("llm.input_messages.1.message.role", "assistant"),
        str("llm.input_messages.1.message.content", "   "),
      ])

      expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "hi" }] }])
    })

    it("preserves message ordering by index", () => {
      const result = parseContent([
        str("llm.input_messages.1.message.role", "assistant"),
        str("llm.input_messages.1.message.content", "second"),
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.content", "first"),
      ])

      expect(result.inputMessages).toEqual([
        { role: "user", parts: [{ type: "text", content: "first" }] },
        { role: "assistant", parts: [{ type: "text", content: "second" }] },
      ])
    })

    it("closes gaps in indices instead of emitting placeholder messages", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.content", "zero"),
        str("llm.input_messages.2.message.role", "user"),
        str("llm.input_messages.2.message.content", "two"),
      ])

      expect(result.inputMessages).toEqual([
        { role: "user", parts: [{ type: "text", content: "zero" }] },
        { role: "user", parts: [{ type: "text", content: "two" }] },
      ])
    })
  })

  describe("multimodal content parts", () => {
    it("builds a text + image part array from message.contents.*", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.contents.0.message_content.type", "text"),
        str("llm.input_messages.0.message.contents.0.message_content.text", "Look at this"),
        str("llm.input_messages.0.message.contents.1.message_content.type", "image"),
        str("llm.input_messages.0.message.contents.1.message_content.image.image.url", "https://example.com/cat.jpg"),
      ])

      const userMsg = result.inputMessages.find((m) => m.role === "user")
      expect(userMsg).toBeDefined()
      const parts = (userMsg as { parts: { type: string; content?: string; uri?: string }[] }).parts
      expect(parts.some((p) => p.type === "text" && p.content === "Look at this")).toBe(true)
      const uriPart = parts.find((p) => p.type === "uri")
      expect((uriPart as { uri: string }).uri).toBe("https://example.com/cat.jpg")
    })

    it("orders content parts by index", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.contents.1.message_content.type", "text"),
        str("llm.input_messages.0.message.contents.1.message_content.text", "second"),
        str("llm.input_messages.0.message.contents.0.message_content.type", "text"),
        str("llm.input_messages.0.message.contents.0.message_content.text", "first"),
      ])

      const userMsg = result.inputMessages.find((m) => m.role === "user")
      const parts = (userMsg as { parts: { type: string; content?: string }[] }).parts
      const texts = parts.filter((p) => p.type === "text").map((p) => p.content)
      expect(texts).toEqual(["first", "second"])
    })

    it("defaults a content part type to text and a missing text to empty string", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.contents.0.message_content.text", "only text supplied"),
      ])

      const userMsg = result.inputMessages.find((m) => m.role === "user")
      const parts = (userMsg as { parts: { type: string; content?: string }[] }).parts
      expect(parts.some((p) => p.type === "text" && p.content === "only text supplied")).toBe(true)
    })

    it("drops an image part that has no url rather than emitting an empty text part", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.contents.0.message_content.type", "image"),
        str("llm.input_messages.0.message.contents.1.message_content.type", "text"),
        str("llm.input_messages.0.message.contents.1.message_content.text", "look"),
      ])

      expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "look" }] }])
    })

    it("drops the whole message when an urlless image part is its only content", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.contents.0.message_content.type", "image"),
      ])

      expect(result.inputMessages).toEqual([])
    })

    it("prefers content parts over a plain content string when both are present", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.content", "ignored plain content"),
        str("llm.input_messages.0.message.contents.0.message_content.type", "text"),
        str("llm.input_messages.0.message.contents.0.message_content.text", "from parts"),
      ])

      const userMsg = result.inputMessages.find((m) => m.role === "user")
      const parts = (userMsg as { parts: { type: string; content?: string }[] }).parts
      expect(parts.map((p) => p.content)).toEqual(["from parts"])
    })
  })

  describe("reasoning parts", () => {
    it("drops an assistant turn whose only reasoning part is encrypted", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.content", "hi"),
        str("llm.input_messages.1.message.role", "assistant"),
        str("llm.input_messages.1.message.contents.0.message_content.type", "reasoning"),
        str("llm.input_messages.1.message.contents.0.message_content.encrypted_content", "gAAAAABqfn9xBE78"),
      ])

      expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "hi" }] }])
    })

    it("emits a reasoning part when the reasoning summary text is present", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "assistant"),
        str("llm.input_messages.0.message.contents.0.message_content.type", "reasoning"),
        str("llm.input_messages.0.message.contents.0.message_content.text", "Evaluating the Airtable issue"),
      ])

      expect(result.inputMessages).toEqual([
        { role: "assistant", parts: [{ type: "reasoning", content: "Evaluating the Airtable issue" }] },
      ])
    })

    it("keeps the readable half of a reasoning part that also carries encrypted content", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "assistant"),
        str("llm.input_messages.0.message.contents.0.message_content.type", "reasoning"),
        str("llm.input_messages.0.message.contents.0.message_content.encrypted_content", "gAAAAABqfn_k"),
        str("llm.input_messages.0.message.contents.0.message_content.text", "Weighing the rollout"),
      ])

      expect(result.inputMessages).toEqual([
        { role: "assistant", parts: [{ type: "reasoning", content: "Weighing the rollout" }] },
      ])
    })

    it("keeps a tool call on a turn whose reasoning part is encrypted", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "assistant"),
        str("llm.input_messages.0.message.contents.0.message_content.type", "reasoning"),
        str("llm.input_messages.0.message.contents.0.message_content.encrypted_content", "gAAAAABqfn_k"),
        str("llm.input_messages.0.message.tool_calls.0.tool_call.id", "call_IkYeKNxq"),
        str("llm.input_messages.0.message.tool_calls.0.tool_call.function.name", "delegate_task"),
        str("llm.input_messages.0.message.tool_calls.0.tool_call.function.arguments", '{"goal":"inventory"}'),
      ])

      expect(result.inputMessages).toEqual([
        {
          role: "assistant",
          parts: [{ type: "tool_call", id: "call_IkYeKNxq", name: "delegate_task", arguments: { goal: "inventory" } }],
        },
      ])
    })
  })

  describe("output messages and tool calls", () => {
    it("parses an assistant text response", () => {
      const result = parseContent([
        str("llm.output_messages.0.message.role", "assistant"),
        str("llm.output_messages.0.message.content", "Hi there!"),
      ])

      expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "Hi there!" }] }])
    })

    it("parses an assistant message with text + a single tool_call", () => {
      const result = parseContent([
        str("llm.output_messages.0.message.role", "assistant"),
        str("llm.output_messages.0.message.content", "Let me check the weather."),
        str("llm.output_messages.0.message.tool_calls.0.tool_call.function.name", "get_weather"),
        str("llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments", '{"city":"Barcelona"}'),
      ])

      const assistant = result.outputMessages.find((m) => m.role === "assistant")
      const parts = (assistant as { parts: { type: string; name?: string; content?: string; arguments?: unknown }[] })
        .parts
      const text = parts.find((p) => p.type === "text")
      expect((text as { content: string }).content).toBe("Let me check the weather.")
      const toolCall = parts.find((p) => p.type === "tool_call")
      expect((toolCall as { name: string }).name).toBe("get_weather")
      expect((toolCall as { arguments: unknown }).arguments).toEqual({ city: "Barcelona" })
    })

    it("parses multiple tool_calls in index order", () => {
      const result = parseContent([
        str("llm.output_messages.0.message.role", "assistant"),
        str("llm.output_messages.0.message.tool_calls.0.tool_call.function.name", "book_hotel"),
        str("llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments", '{"city":"BCN"}'),
        str("llm.output_messages.0.message.tool_calls.1.tool_call.function.name", "search_attractions"),
        str("llm.output_messages.0.message.tool_calls.1.tool_call.function.arguments", "{}"),
      ])

      const assistant = result.outputMessages.find((m) => m.role === "assistant")
      const toolCalls = (assistant as { parts: { type: string; name?: string }[] }).parts.filter(
        (p) => p.type === "tool_call",
      )
      expect(toolCalls.map((tc) => (tc as { name: string }).name)).toEqual(["book_hotel", "search_attractions"])
    })

    it("honors an explicit tool_call.id", () => {
      const result = parseContent([
        str("llm.output_messages.0.message.role", "assistant"),
        str("llm.output_messages.0.message.tool_calls.0.tool_call.id", "call_explicit"),
        str("llm.output_messages.0.message.tool_calls.0.tool_call.function.name", "fn"),
        str("llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments", "{}"),
      ])

      const assistant = result.outputMessages.find((m) => m.role === "assistant")
      const toolCall = (assistant as { parts: { type: string; id?: string }[] }).parts.find(
        (p) => p.type === "tool_call",
      )
      expect((toolCall as { id: string }).id).toBe("call_explicit")
    })

    it("mints a synthetic id when a tool_call has none", () => {
      const result = parseContent([
        str("llm.output_messages.0.message.role", "assistant"),
        str("llm.output_messages.0.message.tool_calls.0.tool_call.function.name", "fn"),
        str("llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments", "{}"),
      ])

      const assistant = result.outputMessages.find((m) => m.role === "assistant")
      const toolCall = (assistant as { parts: { type: string; id?: string }[] }).parts.find(
        (p) => p.type === "tool_call",
      )
      expect((toolCall as { id: string }).id).toBe("call_0_0")
    })

    it("passes through invalid JSON tool-call arguments as a raw string", () => {
      const result = parseContent([
        str("llm.output_messages.0.message.role", "assistant"),
        str("llm.output_messages.0.message.tool_calls.0.tool_call.function.name", "fn"),
        str("llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments", "{not valid"),
      ])

      const assistant = result.outputMessages.find((m) => m.role === "assistant")
      const toolCall = (assistant as { parts: { type: string; arguments?: unknown }[] }).parts.find(
        (p) => p.type === "tool_call",
      )
      expect((toolCall as { arguments: unknown }).arguments).toBe("{not valid")
    })
  })

  describe("tool result pairing", () => {
    it("links an explicit tool_call_id to its tool result", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.content", "weather?"),
        str("llm.input_messages.1.message.role", "assistant"),
        str("llm.input_messages.1.message.tool_calls.0.tool_call.id", "call_abc"),
        str("llm.input_messages.1.message.tool_calls.0.tool_call.function.name", "get_weather"),
        str("llm.input_messages.1.message.tool_calls.0.tool_call.function.arguments", '{"city":"BCN"}'),
        str("llm.input_messages.2.message.role", "tool"),
        str("llm.input_messages.2.message.tool_call_id", "call_abc"),
        str("llm.input_messages.2.message.content", "sunny"),
      ])

      const assistant = result.inputMessages.find((m) => m.role === "assistant")
      const tool = result.inputMessages.find((m) => m.role === "tool")
      const toolCall = (assistant as { parts: { type: string; id?: string }[] }).parts.find(
        (p) => p.type === "tool_call",
      )
      const toolResult = (tool as { parts: { type: string; id?: string | null }[] }).parts.find(
        (p) => p.type === "tool_call_response",
      )
      expect((toolResult as { id: string }).id).toBe("call_abc")
      expect((toolCall as { id: string }).id).toBe("call_abc")
    })

    it("pairs a tool result to a prior tool_call by name when ids are absent (google-adk)", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.content", "weather?"),
        str("llm.input_messages.1.message.role", "model"),
        str("llm.input_messages.1.message.tool_calls.0.tool_call.function.name", "get_weather"),
        str("llm.input_messages.1.message.tool_calls.0.tool_call.function.arguments", '{"city":"BCN"}'),
        str("llm.input_messages.2.message.role", "tool"),
        str("llm.input_messages.2.message.name", "get_weather"),
        str("llm.input_messages.2.message.content", '{"report":"sunny"}'),
      ])

      const assistant = result.inputMessages.find((m) => m.role === "assistant")
      const tool = result.inputMessages.find((m) => m.role === "tool")
      const toolCall = (assistant as { parts: { type: string; id?: string }[] }).parts.find(
        (p) => p.type === "tool_call",
      )
      const toolResult = (tool as { parts: { type: string; id?: string | null }[] }).parts.find(
        (p) => p.type === "tool_call_response",
      )
      const callId = (toolCall as { id?: string } | undefined)?.id
      const resultId = (toolResult as { id?: string | null } | undefined)?.id
      expect(callId).toBeTruthy()
      expect(resultId).toBe(callId)
    })

    it("falls back to the first pending tool_call when neither id nor name match", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "assistant"),
        str("llm.input_messages.0.message.tool_calls.0.tool_call.function.name", "alpha"),
        str("llm.input_messages.0.message.tool_calls.0.tool_call.function.arguments", "{}"),
        str("llm.input_messages.1.message.role", "tool"),
        str("llm.input_messages.1.message.content", "result"),
      ])

      const assistant = result.inputMessages.find((m) => m.role === "assistant")
      const tool = result.inputMessages.find((m) => m.role === "tool")
      const toolCall = (assistant as { parts: { type: string; id?: string }[] }).parts.find(
        (p) => p.type === "tool_call",
      )
      const toolResult = (tool as { parts: { type: string; id?: string | null }[] }).parts.find(
        (p) => p.type === "tool_call_response",
      )
      expect((toolResult as { id: string }).id).toBe((toolCall as { id: string }).id)
    })
  })

  describe("tool definitions", () => {
    it("parses a wrapped { type, function } tool schema", () => {
      const def = {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get current weather for a city",
          parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
        },
      }
      const result = parseContent([
        str("openinference.span.kind", "LLM"),
        str("llm.tools.0.tool.json_schema", JSON.stringify(def)),
      ])

      expect(result.toolDefinitions).toEqual([
        {
          name: "get_weather",
          description: "Get current weather for a city",
          parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
        },
      ])
    })

    it("parses a flat tool schema without a function wrapper", () => {
      const def = { name: "ping", description: "ping the server", parameters: { type: "object" } }
      const result = parseContent([
        str("openinference.span.kind", "LLM"),
        str("llm.tools.0.tool.json_schema", JSON.stringify(def)),
      ])

      expect(result.toolDefinitions).toEqual([
        { name: "ping", description: "ping the server", parameters: { type: "object" } },
      ])
    })

    it("orders tool definitions by index", () => {
      const result = parseContent([
        str("openinference.span.kind", "LLM"),
        str("llm.tools.1.tool.json_schema", JSON.stringify({ name: "second" })),
        str("llm.tools.0.tool.json_schema", JSON.stringify({ name: "first" })),
      ])

      expect(result.toolDefinitions.map((t) => t.name)).toEqual(["first", "second"])
    })

    it("drops a tool definition with malformed JSON but keeps the valid ones", () => {
      const result = parseContent([
        str("openinference.span.kind", "LLM"),
        str("llm.tools.0.tool.json_schema", "{ not valid json"),
        str("llm.tools.1.tool.json_schema", JSON.stringify({ name: "valid" })),
      ])

      expect(result.toolDefinitions.map((t) => t.name)).toEqual(["valid"])
    })

    it("drops a tool definition that parses but has no name", () => {
      const result = parseContent([
        str("openinference.span.kind", "LLM"),
        str("llm.tools.0.tool.json_schema", JSON.stringify({ description: "no name" })),
        str("llm.tools.1.tool.json_schema", JSON.stringify({ name: "keep" })),
      ])

      expect(result.toolDefinitions.map((t) => t.name)).toEqual(["keep"])
    })

    it("returns no tool definitions when llm.tools.* is absent", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.content", "hi"),
      ])

      expect(result.toolDefinitions).toEqual([])
    })
  })

  describe("edge cases", () => {
    it("ignores malformed indexed keys that have no index segment", () => {
      const result = parseContent([
        str("llm.input_messages.role", "user"),
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.content", "ok"),
      ])

      expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "ok" }] }])
    })

    it("ignores indexed keys with a non-numeric index", () => {
      const result = parseContent([
        str("llm.input_messages.abc.message.role", "user"),
        str("llm.input_messages.abc.message.content", "ignored"),
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.content", "kept"),
      ])

      expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "kept" }] }])
    })

    it("returns empty input/output but populates tool definitions when only tools are present", () => {
      const result = parseContent([
        str("openinference.span.kind", "LLM"),
        str("llm.tools.0.tool.json_schema", JSON.stringify({ name: "solo" })),
      ])

      expect(result.inputMessages).toEqual([])
      expect(result.outputMessages).toEqual([])
      expect(result.toolDefinitions.map((t) => t.name)).toEqual(["solo"])
    })

    it("handles input and output messages together", () => {
      const result = parseContent([
        str("llm.input_messages.0.message.role", "user"),
        str("llm.input_messages.0.message.content", "What is 2+2?"),
        str("llm.output_messages.0.message.role", "assistant"),
        str("llm.output_messages.0.message.content", "4"),
      ])

      expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "What is 2+2?" }] }])
      expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "4" }] }])
    })
  })
})
