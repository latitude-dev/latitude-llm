import { describe, expect, it } from "vitest"
import {
  detectScriptCapabilities,
  hasEmbeddingCapability,
  hasLlmCapability,
  requiresEmbedding,
  resolveScriptCapabilities,
} from "./capabilities.ts"

describe("detectScriptCapabilities", () => {
  it("detects llm() references", () => {
    expect(detectScriptCapabilities("const r = await llm(`judge this`)")).toEqual(["llm"])
    expect(detectScriptCapabilities("await llm (prompt)")).toEqual(["llm"])
  })

  it("detects semanticSimilarity() references as the embedding capability", () => {
    expect(detectScriptCapabilities("const s = await semanticSimilarity('frustration')")).toEqual(["embedding"])
    expect(detectScriptCapabilities("await semanticSimilarity ('x')")).toEqual(["embedding"])
  })

  it("detects both capabilities when a script uses each", () => {
    expect(detectScriptCapabilities("await llm(`x`); await semanticSimilarity('y')")).toEqual(["llm", "embedding"])
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
    expect(hasEmbeddingCapability(["embedding"])).toBe(true)
    expect(hasEmbeddingCapability(["llm"])).toBe(false)
  })

  it("requiresEmbedding is true only when the source calls semanticSimilarity()", () => {
    expect(requiresEmbedding("const s = await semanticSimilarity('frustration'); return Score(s)")).toBe(true)
    expect(requiresEmbedding("await llm(`x`); return Score(1)")).toBe(false)
    expect(requiresEmbedding("return Score(1)")).toBe(false)
  })
})
