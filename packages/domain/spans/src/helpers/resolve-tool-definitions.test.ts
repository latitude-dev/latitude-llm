import { describe, expect, it } from "vitest"
import { toolDefinitionsFrom, toToolDefinition } from "./resolve-tool-definitions.ts"

describe("toToolDefinition", () => {
  const schema = { type: "object", properties: { query: { type: "string" } } }

  it.each([
    ["OpenAI/OTEL `parameters`", { name: "search_kb", parameters: schema }],
    ["Vercel's `inputSchema`", { name: "search_kb", inputSchema: schema }],
    ["Anthropic's `input_schema`", { name: "search_kb", input_schema: schema }],
  ])("reads the schema from %s", (_label, raw) => {
    expect(toToolDefinition(raw)).toEqual({ name: "search_kb", description: "", parameters: schema })
  })

  it("reads the Anthropic spelling inside a wrapped definition too", () => {
    expect(toToolDefinition({ type: "function", function: { name: "search_kb", input_schema: schema } })).toEqual({
      name: "search_kb",
      description: "",
      parameters: schema,
    })
  })

  it("keeps `parameters` when a payload carries more than one spelling", () => {
    expect(toToolDefinition({ name: "t", parameters: schema, input_schema: { type: "string" } })?.parameters).toEqual(
      schema,
    )
  })

  it("needs a name", () => {
    expect(toToolDefinition({ parameters: schema })).toBeUndefined()
    expect(toToolDefinition({ function: { parameters: schema } })).toBeUndefined()
  })
})

describe("toolDefinitionsFrom", () => {
  const tool = { type: "function", name: "search_kb", description: "d", parameters: { type: "object" } }

  it("reads a request body that holds `tools`", () => {
    expect(toolDefinitionsFrom({ tools: [tool] }).map((t) => t.name)).toEqual(["search_kb"])
  })

  // `gen_ai.tool.definitions` is the array itself, and that is how a vendor hands it back out of
  // its metadata map — as a bare array, or a JSON string of one.
  it.each([
    ["a bare array", [tool]],
    ["a JSON string of an array", JSON.stringify([tool])],
    ["a JSON string of a request body", JSON.stringify({ tools: [tool] })],
  ])("reads %s", (_label, payload) => {
    expect(toolDefinitionsFrom(payload).map((t) => t.name)).toEqual(["search_kb"])
  })

  it("takes the first candidate that declares any", () => {
    expect(toolDefinitionsFrom(undefined, "", [tool], { tools: [{ name: "later" }] }).map((t) => t.name)).toEqual([
      "search_kb",
    ])
  })

  it("treats no tools anywhere as an absence", () => {
    expect(toolDefinitionsFrom(undefined, "", {}, "not json")).toEqual([])
  })
})
