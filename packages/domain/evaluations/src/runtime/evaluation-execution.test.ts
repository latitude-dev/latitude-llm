import { getEncoding } from "js-tiktoken"
import { describe, expect, it } from "vitest"
import { fitPromptToJudgeContextWindow } from "./evaluation-execution.ts"

const encoder = getEncoding("o200k_base")
const countTokens = (text: string) => encoder.encode(text).length

describe("fitPromptToJudgeContextWindow", () => {
  it("returns the prompt unchanged when it fits comfortably", () => {
    const prompt = "Criteria: is the user happy?\n\nConversation:\n[user] hi\n[assistant] hello"
    expect(fitPromptToJudgeContextWindow(prompt, "amazon-bedrock", "minimax.minimax-m2.5")).toBe(prompt)
  })

  it("truncates a prompt that exceeds the resolved model's context window, keeping it under budget", () => {
    const head = "Criteria: the user got frustrated.\n\nConversation:\n"
    const tail = "\n[assistant] final resolution message"
    const filler = "the quick brown fox jumps over the lazy dog. ".repeat(50_000)
    const prompt = `${head}${filler}${tail}`

    const fitted = fitPromptToJudgeContextWindow(prompt, "amazon-bedrock", "minimax.minimax-m2.5")

    expect(fitted.length).toBeLessThan(prompt.length)
    expect(fitted.startsWith(head)).toBe(true)
    expect(fitted.endsWith(tail)).toBe(true)
    expect(fitted).toContain("truncated")
    // MiniMax's own context (196,608) is larger than its Bedrock fallback's (128,000); the guard
    // must size to the smaller one so a retry against the fallback doesn't blow its window too.
    expect(countTokens(fitted)).toBeLessThan(128_000)
  })

  it("sizes the budget off a configured maxOutputTokens instead of the hardcoded default", () => {
    const filler = "the quick brown fox jumps over the lazy dog. ".repeat(50_000)

    const fittedDefault = fitPromptToJudgeContextWindow(filler, "amazon-bedrock", "minimax.minimax-m2.5")
    const fittedLargerOutput = fitPromptToJudgeContextWindow(filler, "amazon-bedrock", "minimax.minimax-m2.5", 40_000)

    expect(countTokens(fittedLargerOutput)).toBeLessThan(countTokens(fittedDefault))
  })

  it("falls back to a small, safe budget for a model missing from the registry", () => {
    const short = "short prompt"
    expect(fitPromptToJudgeContextWindow(short, "custom", "not-a-real-model")).toBe(short)

    const long = "the quick brown fox jumps over the lazy dog. ".repeat(5_000)
    const fitted = fitPromptToJudgeContextWindow(long, "custom", "not-a-real-model")
    expect(fitted.length).toBeLessThan(long.length)
    // Unregistered models (e.g. a small self-hosted deployment) get a conservative budget, not an
    // optimistic one that would still overflow a genuinely small context window.
    expect(countTokens(fitted)).toBeLessThan(8_000)
  })

  it("never returns a prompt longer than the input, even when the truncation notice itself doesn't fit the budget", () => {
    const prompt = "y".repeat(500)
    // FALLBACK_JUDGE_CONTEXT_LIMIT_TOKENS (16k) minus this maxOutputTokens minus the safety margin
    // (500) leaves a 5-token budget — smaller than the truncation notice itself.
    const fitted = fitPromptToJudgeContextWindow(prompt, "custom", "not-a-real-model", 16_000 - 500 - 5)
    expect(fitted.length).toBeLessThanOrEqual(prompt.length)
    expect(countTokens(fitted)).toBeLessThanOrEqual(5)
  })

  it("splits the retained budget evenly regardless of where the script's own instructions end (known limitation)", () => {
    // fitPromptToJudgeContextWindow only sees an opaque string — there's no delimiter distinguishing
    // an evaluation script's own instructions from the conversation it embeds — so a 50/50 head/tail
    // split can cut into a long instruction preamble instead of just the conversation body. Preserving
    // an arbitrary script's instruction section intact would require the sandbox's `llm()` contract to
    // pass structured `{instructions, conversation}` input instead of a flat prompt string.
    const longInstructions = "Follow this rubric carefully: ".repeat(200_000)
    const tail = "\n[assistant] final resolution message"
    const prompt = `${longInstructions}${tail}`

    const fitted = fitPromptToJudgeContextWindow(prompt, "amazon-bedrock", "minimax.minimax-m2.5")

    expect(fitted.length).toBeLessThan(prompt.length)
    expect(fitted.startsWith(longInstructions)).toBe(false)
  })
})
