import { describe, expect, it } from "vitest"
import { detectScriptCapabilities, hasLlmCapability, resolveScriptCapabilities } from "./capabilities.ts"

describe("detectScriptCapabilities", () => {
  it("detects llm() references", () => {
    expect(detectScriptCapabilities("const r = await llm(`judge this`)")).toEqual(["llm"])
    expect(detectScriptCapabilities("await llm (prompt)")).toEqual(["llm"])
  })

  it("treats scripts without llm references as pure", () => {
    expect(detectScriptCapabilities("return Score(1)")).toEqual([])
    expect(detectScriptCapabilities("const callme = filmography()")).toEqual([])
    expect(detectScriptCapabilities("const allmessages = conversation.length")).toEqual([])
  })

  it("supports explicit declaration overrides", () => {
    expect(resolveScriptCapabilities({ source: "return Score(1)", declared: ["llm"] })).toEqual(["llm"])
    expect(resolveScriptCapabilities({ source: "await llm(`x`)", declared: [] })).toEqual([])
    expect(resolveScriptCapabilities({ source: "await llm(`x`)" })).toEqual(["llm"])
  })

  it("answers capability membership", () => {
    expect(hasLlmCapability(["llm"])).toBe(true)
    expect(hasLlmCapability([])).toBe(false)
  })
})
