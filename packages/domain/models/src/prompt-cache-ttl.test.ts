import { describe, expect, it } from "vitest"
import { PROMPT_CACHE_TTL_SECONDS_OPTIONS, promptCacheTtlSeconds, promptCacheTtlSource } from "./prompt-cache-ttl.ts"

const ttl = (provider: string, model: string) => promptCacheTtlSeconds({ provider, model })

describe("promptCacheTtlSeconds", () => {
  it("gives Anthropic the documented five-minute default", () => {
    expect(ttl("anthropic", "claude-opus-4-5")).toBe(300)
    expect(ttl("anthropic", "claude-haiku-4-5")).toBe(300)
  })

  it("gives OpenAI's extended-retention families a full day, and the rest five minutes", () => {
    // Extended retention is the default for the listed families and the only mode from
    // 5.5 on, at the same price. The list leaves out the mini/nano/pro variants, which
    // keep the in-memory policy — so a prefix match on `gpt-5.4` must not catch
    // `gpt-5.4-mini`.
    expect(ttl("openai", "gpt-5.6")).toBe(86_400)
    expect(ttl("openai", "gpt-5.6-luna")).toBe(86_400)
    expect(ttl("openai", "gpt-4.1")).toBe(86_400)
    expect(ttl("openai", "gpt-5.1-codex-max")).toBe(86_400)
    expect(ttl("openai", "gpt-5.4-mini")).toBe(300)
    expect(ttl("openai", "gpt-5-mini")).toBe(300)
    expect(ttl("openai", "gpt-5-nano")).toBe(300)
    expect(ttl("openai", "gpt-5-pro")).toBe(300)
  })

  it("splits Bedrock by hosted family, the way Bedrock's own table does", () => {
    expect(ttl("amazon-bedrock", "anthropic.claude-opus-4-5-20251101-v1:0")).toBe(300)
    // Bedrock states its own numbers, and hosts GPT-5.6 at thirty minutes rather than
    // OpenAI's day.
    expect(ttl("amazon-bedrock", "openai.gpt-5.6-sol")).toBe(1_800)
  })

  it("claims no lifetime for a best-effort cache, even though a number is published", () => {
    // Gemini's 24-hour figure bounds how long RAM may hold an entry, not how long a
    // read can count on finding one. Treating it as a window would mark anything
    // called more than daily as fully reachable.
    expect(ttl("google", "gemini-2.5-pro")).toBeNull()
    expect(ttl("google-vertex", "gemini-2.5-flash")).toBeNull()
  })

  it("folds provider aliases, so an SDK's own id resolves to the same lifetime", () => {
    expect(ttl("@ai-sdk/anthropic", "claude-opus-4-5")).toBe(300)
    expect(ttl("Bedrock", "anthropic.claude-opus-4-5")).toBe(300)
  })

  it("matches a family prefix, so dated and regional variants inherit their family", () => {
    expect(ttl("anthropic", "claude-sonnet-4-5-20250929")).toBe(300)
    expect(ttl("openai", "GPT-5.6-Sol")).toBe(86_400)
  })

  it("returns null rather than guessing for a pair no documentation covers", () => {
    // The whole point: an invented lifetime produces a confident ceiling, and a
    // recommendation drawn from it, on traffic we know nothing about.
    expect(ttl("some-gateway", "mystery-1")).toBeNull()
    expect(ttl("", "")).toBeNull()
    // DeepSeek documents cleanup "within a few hours to a few days" — a
    // garbage-collection policy, not a window a gap can be compared against.
    expect(ttl("deepseek", "deepseek-chat")).toBeNull()
    // A future OpenAI family falls through rather than inheriting a listed one.
    expect(ttl("openai", "gpt-7")).toBeNull()
    expect(ttl("google", "gemini-2.0-flash")).toBeNull()
  })
})

describe("promptCacheTtlSource", () => {
  it("cites the documentation behind every lifetime it returns", () => {
    for (const [provider, model] of [
      ["anthropic", "claude-opus-4-5"],
      ["openai", "gpt-5.6"],
      ["openai", "gpt-5-mini"],
      ["amazon-bedrock", "openai.gpt-5.6-sol"],
    ] as const) {
      expect(promptCacheTtlSource({ provider, model })).toMatch(/^https:\/\//)
    }
  })

  it("cites nothing where it claims nothing", () => {
    expect(promptCacheTtlSource({ provider: "deepseek", model: "deepseek-chat" })).toBeNull()
    expect(promptCacheTtlSource({ provider: "google", model: "gemini-2.5-pro" })).toBeNull()
  })
})

describe("PROMPT_CACHE_TTL_SECONDS_OPTIONS", () => {
  it("covers every lifetime a rule can resolve to, which is what a single query pass needs", () => {
    for (const [provider, model] of [
      ["anthropic", "claude-opus-4-5"],
      ["openai", "gpt-5.6"],
      ["openai", "gpt-5-mini"],
      ["amazon-bedrock", "anthropic.claude-opus-4-5"],
    ] as const) {
      expect(PROMPT_CACHE_TTL_SECONDS_OPTIONS).toContain(promptCacheTtlSeconds({ provider, model }))
    }
  })

  it("is ascending, deduplicated, and small enough to measure in one pass", () => {
    expect([...PROMPT_CACHE_TTL_SECONDS_OPTIONS]).toEqual(
      [...new Set(PROMPT_CACHE_TTL_SECONDS_OPTIONS)].sort((a, b) => a - b),
    )
    expect(PROMPT_CACHE_TTL_SECONDS_OPTIONS.length).toBeLessThanOrEqual(6)
  })
})
