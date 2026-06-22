import { describe, expect, it } from "vitest"
import type { OtlpKeyValue } from "../types.ts"
import { parseContent } from "./index.ts"

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}

function strArray(key: string, values: string[]): OtlpKeyValue {
  return { key, value: { arrayValue: { values: values.map((v) => ({ stringValue: v })) } } }
}

const SYSTEM_PROMPT = "You are a precise travel assistant."

describe("parseContent (Vercel) — dispatch", () => {
  it("does not handle gen_ai.input.messages / gen_ai.output.messages (genai current owns it)", () => {
    const result = parseContent([
      str("gen_ai.input.messages", JSON.stringify([{ role: "user", parts: [{ type: "text", content: "hi" }] }])),
    ])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "hi" }] }])
  })

  it("handles a span that has ai.prompt", () => {
    const result = parseContent([str("ai.prompt", JSON.stringify({ messages: [{ role: "user", content: "hello" }] }))])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "hello" }] }])
  })

  it("handles a span that has only ai.prompt.messages", () => {
    const result = parseContent([str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "hello" }]))])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "hello" }] }])
  })
})

describe("parseContent (Vercel) — ai.prompt top-level input", () => {
  it("parses system + messages object", () => {
    const result = parseContent([
      str(
        "ai.prompt",
        JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: [{ type: "text", text: "Plan a trip to Barcelona." }] }],
        }),
      ),
    ])

    expect(result.systemInstructions).toEqual([{ type: "text", content: SYSTEM_PROMPT }])
    expect(result.inputMessages).toEqual([
      { role: "user", parts: [{ type: "text", content: "Plan a trip to Barcelona." }] },
    ])
  })

  it("parses a multimodal user message (text + image url)", () => {
    const result = parseContent([
      str(
        "ai.prompt",
        JSON.stringify({
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "What is in this photo?" },
                { type: "image", image: "https://example.com/photo.jpg" },
              ],
            },
          ],
        }),
      ),
    ])

    expect(result.inputMessages).toHaveLength(1)
    const parts = result.inputMessages[0]?.parts as { type: string }[]
    expect(parts.some((p) => p.type === "text")).toBe(true)
    expect(parts.some((p) => p.type === "uri" || p.type === "blob" || p.type === "file")).toBe(true)
  })

  it("maps prior assistant tool-call and tool-result history", () => {
    const result = parseContent([
      str(
        "ai.prompt",
        JSON.stringify({
          messages: [
            { role: "user", content: [{ type: "text", text: "Weather in BCN?" }] },
            {
              role: "assistant",
              content: [{ type: "tool-call", toolCallId: "call_1", toolName: "get_weather", input: { city: "BCN" } }],
            },
            {
              role: "tool",
              content: [{ type: "tool-result", toolCallId: "call_1", toolName: "get_weather", result: { temp: 22 } }],
            },
          ],
        }),
      ),
    ])

    const roles = result.inputMessages.map((m) => m.role)
    expect(roles).toContain("user")
    expect(roles).toContain("assistant")
    expect(roles).toContain("tool")

    const assistant = result.inputMessages.find((m) => m.role === "assistant")
    const assistantParts = (assistant as { parts: { type: string; name?: string }[] }).parts
    const toolCall = assistantParts.find((p) => p.type === "tool_call")
    expect((toolCall as { name: string }).name).toBe("get_weather")

    const tool = result.inputMessages.find((m) => m.role === "tool")
    const toolParts = (tool as { parts: { type: string }[] }).parts
    expect(toolParts.some((p) => p.type === "tool_call_response")).toBe(true)
  })

  it("falls back to ai.prompt.prompt as a single user message when messages is absent", () => {
    const result = parseContent([
      str("ai.prompt", JSON.stringify({ system: "You are a triage flagger.", prompt: "Classify this text." })),
    ])

    expect(result.systemInstructions).toEqual([{ type: "text", content: "You are a triage flagger." }])
    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "Classify this text." }] }])
  })

  it("preserves system instructions when ai.prompt has a system but no messages or prompt", () => {
    const result = parseContent([str("ai.prompt", JSON.stringify({ system: SYSTEM_PROMPT }))])

    expect(result.systemInstructions).toEqual([{ type: "text", content: SYSTEM_PROMPT }])
    expect(result.inputMessages).toEqual([])
  })

  it("ignores an empty messages array (no prompt) — empty input, empty system", () => {
    const result = parseContent([str("ai.prompt", JSON.stringify({ messages: [] }))])

    expect(result.inputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
  })

  it("treats a non-string system value as no system instructions", () => {
    const result = parseContent([
      str("ai.prompt", JSON.stringify({ system: { tone: "formal" }, messages: [{ role: "user", content: "hi" }] })),
    ])

    expect(result.systemInstructions).toEqual([])
    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "hi" }] }])
  })

  it("treats an empty-string system value as no system instructions", () => {
    const result = parseContent([
      str("ai.prompt", JSON.stringify({ system: "", messages: [{ role: "user", content: "hi" }] })),
    ])

    expect(result.systemInstructions).toEqual([])
  })
})

describe("parseContent (Vercel) — ai.prompt.messages call-level input", () => {
  it("parses a message array when ai.prompt is absent", () => {
    const result = parseContent([
      str(
        "ai.prompt.messages",
        JSON.stringify([{ role: "user", content: [{ type: "text", text: "Hello from call level" }] }]),
      ),
    ])

    expect(result.inputMessages).toEqual([
      { role: "user", parts: [{ type: "text", content: "Hello from call level" }] },
    ])
  })

  it("is only used as a fallback — ai.prompt messages take precedence", () => {
    const result = parseContent([
      str("ai.prompt", JSON.stringify({ messages: [{ role: "user", content: "from top level" }] })),
      str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "from call level" }])),
    ])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "from top level" }] }])
  })

  it("falls back to ai.prompt.messages when ai.prompt has no usable messages", () => {
    const result = parseContent([
      str("ai.prompt", JSON.stringify({ system: SYSTEM_PROMPT, messages: [] })),
      str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "from call level" }])),
    ])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "from call level" }] }])
  })

  it("returns empty for an empty ai.prompt.messages array", () => {
    const result = parseContent([str("ai.prompt.messages", JSON.stringify([]))])

    expect(result.inputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
  })

  it("returns empty for a non-array ai.prompt.messages payload", () => {
    const result = parseContent([str("ai.prompt.messages", JSON.stringify({ role: "user", content: "oops" }))])

    expect(result.inputMessages).toEqual([])
  })
})

describe("parseContent (Vercel) — output (ai.response.*)", () => {
  it("parses ai.response.text into an assistant text message", () => {
    const result = parseContent([
      str("ai.prompt", JSON.stringify({ messages: [{ role: "user", content: "hi" }] })),
      str("ai.response.text", "Hello there!"),
    ])

    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "Hello there!" }] }])
  })

  it("parses ai.response.toolCalls into assistant tool_call parts", () => {
    const result = parseContent([
      str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "weather?" }])),
      str(
        "ai.response.toolCalls",
        JSON.stringify([{ toolCallId: "call_w_1", toolName: "get_weather", input: { city: "BCN" } }]),
      ),
    ])

    expect(result.outputMessages).toHaveLength(1)
    expect(result.outputMessages[0]?.role).toBe("assistant")
    const parts = (result.outputMessages[0] as { parts: { type: string; id?: string; name?: string }[] }).parts
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ type: "tool_call", id: "call_w_1", name: "get_weather" })
  })

  it("combines text and tool calls in a single assistant message", () => {
    const result = parseContent([
      str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "weather?" }])),
      str("ai.response.text", "Let me check the weather."),
      str(
        "ai.response.toolCalls",
        JSON.stringify([{ toolCallId: "call_w_1", toolName: "get_weather", input: { city: "BCN" } }]),
      ),
    ])

    expect(result.outputMessages).toHaveLength(1)
    const parts = (result.outputMessages[0] as { parts: { type: string; content?: string; name?: string }[] }).parts
    const textPart = parts.find((p) => p.type === "text")
    expect((textPart as { content: string }).content).toBe("Let me check the weather.")
    const toolCall = parts.find((p) => p.type === "tool_call")
    expect((toolCall as { name: string }).name).toBe("get_weather")
  })

  it("emits multiple tool_call parts for multiple tool calls", () => {
    const result = parseContent([
      str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "do stuff" }])),
      str(
        "ai.response.toolCalls",
        JSON.stringify([
          { toolCallId: "call_a", toolName: "book_hotel", input: { city: "BCN" } },
          { toolCallId: "call_b", toolName: "search_attractions", input: { city: "BCN" } },
        ]),
      ),
    ])

    const parts = (result.outputMessages[0] as { parts: { type: string; name?: string }[] }).parts
    const toolCalls = parts.filter((p) => p.type === "tool_call")
    expect(toolCalls.map((p) => (p as { name: string }).name)).toEqual(["book_hotel", "search_attractions"])
  })

  it("surfaces ai.response.object as assistant text when ai.response.text is absent", () => {
    const obj = { city: "Barcelona", temperature: 22 }
    const result = parseContent([
      str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "describe" }])),
      str("ai.response.object", JSON.stringify(obj)),
    ])

    expect(result.outputMessages).toEqual([
      { role: "assistant", parts: [{ type: "text", content: JSON.stringify(obj) }] },
    ])
  })

  it("prefers ai.response.text over ai.response.object", () => {
    const result = parseContent([
      str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "x" }])),
      str("ai.response.text", "plain text wins"),
      str("ai.response.object", JSON.stringify({ ignored: true })),
    ])

    expect(result.outputMessages).toEqual([
      { role: "assistant", parts: [{ type: "text", content: "plain text wins" }] },
    ])
  })

  it("ignores malformed ai.response.toolCalls JSON (still emits text)", () => {
    const result = parseContent([
      str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "x" }])),
      str("ai.response.text", "fallback text"),
      str("ai.response.toolCalls", "{ not valid json"),
    ])

    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "fallback text" }] }])
  })

  it("ignores a non-array ai.response.toolCalls payload", () => {
    const result = parseContent([
      str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "x" }])),
      str("ai.response.text", "only text"),
      str("ai.response.toolCalls", JSON.stringify({ toolCallId: "c", toolName: "t", input: {} })),
    ])

    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "only text" }] }])
  })

  it("produces no output messages when there is no response attribute", () => {
    const result = parseContent([str("ai.prompt", JSON.stringify({ messages: [{ role: "user", content: "hi" }] }))])

    expect(result.outputMessages).toEqual([])
  })
})

describe("parseContent (Vercel) — tool definitions (ai.prompt.tools)", () => {
  const TOOL_A = {
    type: "function",
    name: "get_weather",
    description: "Get current weather for a city",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
  }
  const TOOL_B = {
    type: "function",
    name: "book_hotel",
    description: "Book a hotel",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
  }

  it("parses a string array of tool definitions", () => {
    const result = parseContent([
      str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "x" }])),
      strArray("ai.prompt.tools", [JSON.stringify(TOOL_A), JSON.stringify(TOOL_B)]),
    ])

    expect(result.toolDefinitions).toEqual([
      { name: "get_weather", description: "Get current weather for a city", parameters: TOOL_A.parameters },
      { name: "book_hotel", description: "Book a hotel", parameters: TOOL_B.parameters },
    ])
  })

  it("unwraps the { function: {...} } variant", () => {
    const wrapped = {
      type: "function",
      function: { name: "calc", description: "Adds", parameters: { type: "object" } },
    }
    const result = parseContent([
      str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "x" }])),
      strArray("ai.prompt.tools", [JSON.stringify(wrapped)]),
    ])

    expect(result.toolDefinitions).toEqual([{ name: "calc", description: "Adds", parameters: { type: "object" } }])
  })

  it("filters out malformed JSON elements but keeps the rest", () => {
    const result = parseContent([
      str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "x" }])),
      strArray("ai.prompt.tools", ["{ not valid json", JSON.stringify(TOOL_A)]),
    ])

    expect(result.toolDefinitions).toEqual([
      { name: "get_weather", description: "Get current weather for a city", parameters: TOOL_A.parameters },
    ])
  })

  it("returns empty when ai.prompt.tools is missing", () => {
    const result = parseContent([str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "x" }]))])

    expect(result.toolDefinitions).toEqual([])
  })

  it("does NOT read ai.prompt.toolDefinitions (only ai.prompt.tools)", () => {
    const result = parseContent([
      str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "x" }])),
      strArray("ai.prompt.toolDefinitions", [JSON.stringify(TOOL_A)]),
    ])

    expect(result.toolDefinitions).toEqual([])
  })

  it("ignores ai.prompt.tools provided as a JSON string instead of an OTLP array", () => {
    const result = parseContent([
      str("ai.prompt.messages", JSON.stringify([{ role: "user", content: "x" }])),
      str("ai.prompt.tools", JSON.stringify([TOOL_A])),
    ])

    expect(result.toolDefinitions).toEqual([])
  })
})

describe("parseContent (Vercel) — malformed and edge inputs", () => {
  it("degrades gracefully on malformed ai.prompt JSON (still parses output)", () => {
    const result = parseContent([str("ai.prompt", "{ not valid json"), str("ai.response.text", "ok")])

    expect(result.inputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "ok" }] }])
  })

  it("degrades gracefully on malformed ai.prompt.messages JSON", () => {
    const result = parseContent([str("ai.prompt.messages", "{ not valid json")])

    expect(result.inputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
  })

  it("returns empty input when ai.prompt is a JSON primitive (not an object)", () => {
    const result = parseContent([str("ai.prompt", JSON.stringify("just a string"))])

    expect(result.inputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
  })

  it("returns empty input when ai.prompt is a JSON array (typeof object but not the expected shape)", () => {
    const result = parseContent([str("ai.prompt", JSON.stringify([{ role: "user", content: "hi" }]))])

    expect(result.inputMessages).toEqual([])
  })

  it("returns fully empty content for an empty ai.prompt object", () => {
    const result = parseContent([str("ai.prompt", JSON.stringify({}))])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
    expect(result.toolDefinitions).toEqual([])
  })
})
