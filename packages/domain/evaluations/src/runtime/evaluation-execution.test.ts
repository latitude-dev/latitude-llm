import { describe, expect, it } from "vitest"
import { fitPromptToJudgeContextWindow } from "./evaluation-execution.ts"

describe("fitPromptToJudgeContextWindow", () => {
  it("returns the prompt unchanged when it fits comfortably", () => {
    const prompt = "Criteria: is the user happy?\n\nConversation:\n[user] hi\n[assistant] hello"
    expect(fitPromptToJudgeContextWindow(prompt, "amazon-bedrock", "minimax.minimax-m2.5")).toBe(prompt)
  })

  it("truncates a prompt that exceeds the resolved model's context window", () => {
    const head = "Criteria: the user got frustrated.\n\nConversation:\n"
    const tail = "\n[assistant] final resolution message"
    const filler = "x".repeat(1_000_000)
    const prompt = `${head}${filler}${tail}`

    const fitted = fitPromptToJudgeContextWindow(prompt, "amazon-bedrock", "minimax.minimax-m2.5")

    expect(fitted.length).toBeLessThan(prompt.length)
    expect(fitted.startsWith(head)).toBe(true)
    expect(fitted.endsWith(tail)).toBe(true)
    expect(fitted).toContain("truncated")
  })

  it("falls back to a conservative budget for a model missing from the registry", () => {
    const short = "short prompt"
    expect(fitPromptToJudgeContextWindow(short, "amazon-bedrock", "not-a-real-model")).toBe(short)

    const long = "x".repeat(1_000_000)
    const fitted = fitPromptToJudgeContextWindow(long, "amazon-bedrock", "not-a-real-model")
    expect(fitted.length).toBeLessThan(long.length)
  })

  it("never returns a prompt longer than the input", () => {
    const prompt = "y".repeat(500)
    const fitted = fitPromptToJudgeContextWindow(prompt, "amazon-bedrock", "minimax.minimax-m2.5")
    expect(fitted.length).toBeLessThanOrEqual(prompt.length)
  })
})
