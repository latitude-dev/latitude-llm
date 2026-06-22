import { describe, expect, it } from "vitest"
import type { OtlpKeyValue } from "../types.ts"
import { parseContent } from "./index.ts"

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}
function int(key: string, value: number): OtlpKeyValue {
  return { key, value: { intValue: String(value) } }
}
function bool(key: string, value: boolean): OtlpKeyValue {
  return { key, value: { boolValue: value } }
}

describe("parseGenAIDeprecated — JSON-string format (gen_ai.prompt / gen_ai.completion)", () => {
  it("parses a system + user prompt and an assistant completion", () => {
    const result = parseContent([
      str(
        "gen_ai.prompt",
        JSON.stringify([
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Hello" },
        ]),
      ),
      str("gen_ai.completion", JSON.stringify([{ role: "assistant", content: "Hi there!" }])),
    ])

    expect(result.systemInstructions).toMatchObject([{ type: "text", content: "You are helpful." }])
    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "Hello" }] }])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "Hi there!" }] }])
    expect(result.toolDefinitions).toEqual([])
  })

  it("maps an assistant tool_calls completion to tool_call parts with parsed arguments", () => {
    const result = parseContent([
      str(
        "gen_ai.completion",
        JSON.stringify([
          {
            role: "assistant",
            content: "Let me check the weather.",
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"BCN"}' } },
            ],
          },
        ]),
      ),
    ])

    expect(result.outputMessages).toEqual([
      {
        role: "assistant",
        parts: [
          { type: "text", content: "Let me check the weather." },
          { type: "tool_call", id: "call_1", name: "get_weather", arguments: { city: "BCN" } },
        ],
      },
    ])
  })

  it("maps a tool-result message (tool role + tool_call_id) to a tool_call_response part", () => {
    const result = parseContent([
      str("gen_ai.prompt", JSON.stringify([{ role: "tool", content: "22C sunny", tool_call_id: "call_1" }])),
    ])

    expect(result.inputMessages).toEqual([
      { role: "tool", parts: [{ type: "tool_call_response", id: "call_1", response: "22C sunny" }] },
    ])
  })

  it("extracts tool definitions from llm.request.functions JSON array (wrapped shape)", () => {
    const result = parseContent([
      str("gen_ai.prompt", JSON.stringify([{ role: "user", content: "Hi" }])),
      str(
        "llm.request.functions",
        JSON.stringify([
          { type: "function", function: { name: "get_weather", description: "d", parameters: { type: "object" } } },
        ]),
      ),
    ])

    expect(result.toolDefinitions).toEqual([{ name: "get_weather", description: "d", parameters: { type: "object" } }])
  })

  it("aliases human→user and ai→assistant roles in the JSON-string format", () => {
    const result = parseContent([
      str(
        "gen_ai.prompt",
        JSON.stringify([
          { role: "human", content: "Hello" },
          { role: "ai", content: "Earlier reply" },
        ]),
      ),
      str("gen_ai.completion", JSON.stringify([{ role: "ai", content: "4" }])),
    ])

    expect(result.inputMessages.map((m) => m.role)).toEqual(["user", "assistant"])
    expect(result.outputMessages.map((m) => m.role)).toEqual(["assistant"])
  })

  it("returns only output when only gen_ai.completion is present", () => {
    const result = parseContent([
      str("gen_ai.completion", JSON.stringify([{ role: "assistant", content: "only out" }])),
    ])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "only out" }] }])
    expect(result.systemInstructions).toEqual([])
  })

  it("returns only input when only gen_ai.prompt is present", () => {
    const result = parseContent([str("gen_ai.prompt", JSON.stringify([{ role: "user", content: "only in" }]))])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "only in" }] }])
    expect(result.outputMessages).toEqual([])
  })

  it("defaults a completion message with no role to assistant", () => {
    const result = parseContent([str("gen_ai.completion", JSON.stringify([{ content: "no role given" }]))])

    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "no role given" }] }])
  })

  it("defaults a completion message with an empty-string role to assistant", () => {
    const result = parseContent([str("gen_ai.completion", JSON.stringify([{ role: "", content: "empty role" }]))])

    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "empty role" }] }])
  })

  it("does not force an unrecognized completion role to assistant", () => {
    const result = parseContent([
      str("gen_ai.completion", JSON.stringify([{ role: "narrator", content: "Once upon a time" }])),
    ])

    expect(result.outputMessages.map((m) => m.role)).toEqual(["narrator"])
  })

  it("degrades to empty input on malformed gen_ai.prompt JSON while completion still parses", () => {
    const result = parseContent([
      str("gen_ai.prompt", "{ not valid json"),
      str("gen_ai.completion", JSON.stringify([{ role: "assistant", content: "ok" }])),
    ])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "ok" }] }])
  })

  it("falls back to the indexed format when gen_ai.prompt is an empty JSON array", () => {
    const result = parseContent([
      str("gen_ai.prompt", "[]"),
      str("gen_ai.prompt.0.role", "user"),
      str("gen_ai.prompt.0.content", "from indexed"),
    ])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "from indexed" }] }])
  })
})

describe("parseGenAIDeprecated — flattened indexed format (gen_ai.prompt.N.* / gen_ai.completion.N.*)", () => {
  it("reassembles indexed role/content into input and output messages", () => {
    const result = parseContent([
      str("gen_ai.prompt.0.role", "system"),
      str("gen_ai.prompt.0.content", "You are helpful."),
      str("gen_ai.prompt.1.role", "user"),
      str("gen_ai.prompt.1.content", "Say hello"),
      str("gen_ai.completion.0.role", "assistant"),
      str("gen_ai.completion.0.content", "Hello!"),
    ])

    expect(result.systemInstructions).toMatchObject([{ type: "text", content: "You are helpful." }])
    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "Say hello" }] }])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "Hello!" }] }])
  })

  it("orders messages by numeric index and drops sparse gaps without inserting blanks", () => {
    const result = parseContent([
      str("gen_ai.prompt.2.role", "user"),
      str("gen_ai.prompt.2.content", "third"),
      str("gen_ai.prompt.0.role", "user"),
      str("gen_ai.prompt.0.content", "first"),
    ])

    expect(result.inputMessages).toEqual([
      { role: "user", parts: [{ type: "text", content: "first" }] },
      { role: "user", parts: [{ type: "text", content: "third" }] },
    ])
  })

  it("coerces non-string intValue and boolValue content to strings", () => {
    const result = parseContent([
      str("gen_ai.prompt.0.role", "user"),
      int("gen_ai.prompt.0.content", 42),
      str("gen_ai.completion.0.role", "assistant"),
      bool("gen_ai.completion.0.content", true),
    ])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "42" }] }])
    expect(result.outputMessages).toEqual([{ role: "assistant", parts: [{ type: "text", content: "true" }] }])
  })

  it("unwraps a stringified parts array in indexed content into a real text part", () => {
    const result = parseContent([
      str("gen_ai.prompt.0.role", "user"),
      str("gen_ai.prompt.0.content", '[{"type":"text","text":"What is the weather?"}]'),
    ])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "What is the weather?" }] }])
  })

  it("aliases indexed human→user and ai→assistant roles, and defaults a missing completion role to assistant", () => {
    const result = parseContent([
      str("gen_ai.prompt.0.role", "human"),
      str("gen_ai.prompt.0.content", "Hello"),
      str("gen_ai.completion.0.content", "Hi"),
    ])

    expect(result.inputMessages.map((m) => m.role)).toEqual(["user"])
    expect(result.outputMessages.map((m) => m.role)).toEqual(["assistant"])
  })

  it("maps an indexed tool-result message (tool role + tool_call_id) to a tool_call_response part", () => {
    const result = parseContent([
      str("gen_ai.prompt.0.role", "tool"),
      str("gen_ai.prompt.0.content", "4"),
      str("gen_ai.prompt.0.tool_call_id", "call_9"),
    ])

    expect(result.inputMessages).toEqual([
      { role: "tool", parts: [{ type: "tool_call_response", id: "call_9", response: "4" }] },
    ])
  })

  it("maps an indexed function role with tool_name to a tool message", () => {
    const result = parseContent([
      str("gen_ai.prompt.0.role", "function"),
      str("gen_ai.prompt.0.content", "fn-output"),
      str("gen_ai.prompt.0.tool_name", "lookup"),
    ])

    expect(result.inputMessages).toMatchObject([
      { role: "tool", parts: [{ type: "tool_call_response", id: null, response: "fn-output" }] },
    ])
  })

  it("maps an indexed legacy function_call (name/arguments) to a tool_call part with null id", () => {
    const result = parseContent([
      str("gen_ai.completion.0.role", "assistant"),
      str("gen_ai.completion.0.function_call.name", "do_it"),
      str("gen_ai.completion.0.function_call.arguments", '{"x":1}'),
    ])

    expect(result.outputMessages).toEqual([
      { role: "assistant", parts: [{ type: "tool_call", id: null, name: "do_it", arguments: { x: 1 } }] },
    ])
  })

  it("extracts tool definitions from indexed llm.request.functions.N.* with parsed parameters", () => {
    const result = parseContent([
      str("gen_ai.completion.0.role", "assistant"),
      str("gen_ai.completion.0.content", "x"),
      str("llm.request.functions.0.name", "get_weather"),
      str("llm.request.functions.0.description", "desc"),
      str("llm.request.functions.0.parameters", '{"type":"object"}'),
    ])

    expect(result.toolDefinitions).toEqual([
      { name: "get_weather", description: "desc", parameters: { type: "object" } },
    ])
  })

  it("keeps unparseable indexed function parameters as the raw string and defaults description", () => {
    const result = parseContent([
      str("gen_ai.completion.0.role", "assistant"),
      str("gen_ai.completion.0.content", "x"),
      str("llm.request.functions.0.name", "f"),
      str("llm.request.functions.0.parameters", "not-json"),
    ])

    expect(result.toolDefinitions).toEqual([{ name: "f", description: "", parameters: "not-json" }])
  })

  it("surfaces indexed tool_calls.N.* as tool_call parts alongside text", () => {
    const result = parseContent([
      str("gen_ai.completion.0.role", "assistant"),
      str("gen_ai.completion.0.content", "calling"),
      str("gen_ai.completion.0.tool_calls.0.id", "call_9"),
      str("gen_ai.completion.0.tool_calls.0.name", "add"),
      str("gen_ai.completion.0.tool_calls.0.arguments", '{"a":2,"b":2}'),
    ])

    expect(result.outputMessages).toEqual([
      {
        role: "assistant",
        parts: [
          { type: "text", content: "calling" },
          { type: "tool_call", id: "call_9", name: "add", arguments: { a: 2, b: 2 } },
        ],
      },
    ])
  })

  it("drops an empty leading slot from a sparse indexed tool_calls index", () => {
    const result = parseContent([
      str("gen_ai.completion.0.role", "assistant"),
      str("gen_ai.completion.0.tool_calls.1.id", "second"),
      str("gen_ai.completion.0.tool_calls.1.name", "two"),
    ])

    expect(result.outputMessages).toEqual([
      { role: "assistant", parts: [{ type: "tool_call", id: "second", name: "two" }] },
    ])
  })
})

describe("parseGenAIDeprecated — dispatch and empties", () => {
  it("returns empty content when gen_ai.prompt has no usable messages", () => {
    const result = parseContent([str("gen_ai.prompt", JSON.stringify([]))])

    expect(result).toEqual({
      inputMessages: [],
      outputMessages: [],
      systemInstructions: [],
      toolDefinitions: [],
    })
  })

  it("ignores indexed entries with a non-numeric index", () => {
    const result = parseContent([
      str("gen_ai.prompt.foo.role", "user"),
      str("gen_ai.prompt.foo.content", "ignored"),
      str("gen_ai.prompt.0.role", "user"),
      str("gen_ai.prompt.0.content", "kept"),
    ])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "kept" }] }])
  })
})
