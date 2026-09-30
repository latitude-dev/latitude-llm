import { describe, expect, it } from "vitest"
import { toolDefinitionsFrom } from "./tools.ts"

describe("toolDefinitionsFrom", () => {
  it("keeps name, description and a plain JSON parameters schema", () => {
    const sym = Symbol("kind")
    const defs = toolDefinitionsFrom([
      {
        name: "exec",
        description: "Run a command",
        parameters: { type: "object", [sym]: "x", properties: { command: { type: "string" } } },
        execute: () => {},
      },
      { name: "", description: "nameless" },
      "junk",
    ])
    expect(defs).toEqual([
      {
        type: "function",
        name: "exec",
        description: "Run a command",
        parameters: { type: "object", properties: { command: { type: "string" } } },
      },
    ])
  })

  it("accepts OpenAI-wrapped definitions and returns undefined for nothing", () => {
    expect(
      toolDefinitionsFrom([{ type: "function", function: { name: "f", description: "d", parameters: {} } }]),
    ).toEqual([{ type: "function", name: "f", description: "d", parameters: {} }])
    expect(toolDefinitionsFrom([])).toBeUndefined()
    expect(toolDefinitionsFrom(undefined)).toBeUndefined()
  })
})
