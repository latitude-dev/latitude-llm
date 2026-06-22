import { describe, expect, it } from "vitest"
import type { OtlpKeyValue } from "../types.ts"
import { parseContent } from "./index.ts"

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}

function int(key: string, value: number): OtlpKeyValue {
  return { key, value: { intValue: String(value) } }
}

describe("parseContent (Claude Code)", () => {
  it("maps user_prompt to a single user text message", () => {
    const result = parseContent([str("user_prompt", "hi claudio")])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "hi claudio" }] }])
    expect(result.outputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
    expect(result.toolDefinitions).toEqual([])
  })

  it("routes to Claude Code alongside benign interaction attributes", () => {
    const result = parseContent([
      str("span.type", "interaction"),
      str("session.id", "9f8b7a76-abd6-4855-9f39-e22ce23ed11e"),
      str("user.id", "user-1"),
      str("model", "claude-opus-4-6"),
      int("user_prompt_length", 10),
      str("user_prompt", "translate this"),
    ])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "translate this" }] }])
    expect(result.outputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
    expect(result.toolDefinitions).toEqual([])
  })

  it("preserves multiline and whitespace-bearing prompts verbatim", () => {
    const prompt = "line one\n  line two\twith tab"
    const result = parseContent([str("user_prompt", prompt)])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: prompt }] }])
  })

  it("returns no input messages when user_prompt is an empty string", () => {
    const result = parseContent([str("user_prompt", "")])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
    expect(result.toolDefinitions).toEqual([])
  })

  it("returns no input messages when user_prompt has no value object", () => {
    const result = parseContent([{ key: "user_prompt" }])

    expect(result.inputMessages).toEqual([])
  })

  it("returns no input messages when user_prompt carries a non-string value", () => {
    const result = parseContent([int("user_prompt", 42)])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
    expect(result.toolDefinitions).toEqual([])
  })

  it("uses the first user_prompt when the key is duplicated", () => {
    const result = parseContent([str("user_prompt", "first"), str("user_prompt", "second")])

    expect(result.inputMessages).toEqual([{ role: "user", parts: [{ type: "text", content: "first" }] }])
  })

  it("returns empty content when user_prompt is absent", () => {
    const result = parseContent([str("span.type", "interaction"), str("session.id", "abc")])

    expect(result.inputMessages).toEqual([])
    expect(result.outputMessages).toEqual([])
    expect(result.systemInstructions).toEqual([])
    expect(result.toolDefinitions).toEqual([])
  })
})
