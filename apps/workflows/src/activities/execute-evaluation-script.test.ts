import {
  EVALUATION_CONVERSATION_PLACEHOLDER,
  EVALUATION_CONVERSATION_TEXT_PLACEHOLDER,
  extractPromptFromEvaluationScript,
  formatEvaluationConversationForPrompt,
  generateBaselinePromptText,
  normalizeLegacyEvaluationScript,
  validateEvaluationScript,
  wrapPromptAsEvaluationScript,
  wrapPromptAsLegacyMvpEvaluationScript,
} from "@domain/evaluations"
import { describe, expect, it } from "vitest"

const DUMMY_CONVERSATION = [
  { role: "user", content: "What is my API key?" },
  { role: "assistant", content: "Your API key is sk-live-123." },
]

describe("evaluation script helpers", () => {
  describe("legacy MVP script compatibility", () => {
    it("extracts prompts from legacy MVP scripts", () => {
      const prompt = `Analyze this conversation:\n${EVALUATION_CONVERSATION_PLACEHOLDER}\n\nDoes it contain issues?`
      const script = wrapPromptAsLegacyMvpEvaluationScript(prompt)
      expect(extractPromptFromEvaluationScript(script)).toBe(prompt)
    })

    it("normalizes legacy MVP scripts to JSON Schema runtime scripts", () => {
      const script = wrapPromptAsLegacyMvpEvaluationScript(`Check this: ${EVALUATION_CONVERSATION_PLACEHOLDER}`)
      const normalized = normalizeLegacyEvaluationScript(script)
      expect(normalized).toContain("verdictSchema")
      expect(normalized).toContain(EVALUATION_CONVERSATION_TEXT_PLACEHOLDER)
      expect(normalized).not.toContain("z.object")
    })

    it("returns null for non-legacy scripts", () => {
      expect(extractPromptFromEvaluationScript("return Passed(1, 'looks good')")).toBeNull()
      expect(extractPromptFromEvaluationScript("")).toBeNull()
    })
  })

  describe("validateEvaluationScript", () => {
    it("accepts JSON Schema runtime scripts", () => {
      const script = wrapPromptAsEvaluationScript(`Check this: ${EVALUATION_CONVERSATION_TEXT_PLACEHOLDER}`)
      expect(validateEvaluationScript(script)).toBe(true)
    })

    it("keeps validating legacy interpolation restrictions", () => {
      const forbidden = ["Issue: ${", "issue.name}"].join("")
      const script = wrapPromptAsLegacyMvpEvaluationScript(forbidden)
      expect(validateEvaluationScript(script)).toBe(false)
    })
  })

  describe("formatEvaluationConversationForPrompt", () => {
    it("formats conversation messages into readable text", () => {
      const result = formatEvaluationConversationForPrompt(DUMMY_CONVERSATION)
      expect(result).toBe("[user] What is my API key?\n[assistant] Your API key is sk-live-123.")
    })

    it("handles an empty conversation", () => {
      expect(formatEvaluationConversationForPrompt([])).toBe("")
    })

    it("handles a single message", () => {
      const result = formatEvaluationConversationForPrompt([{ role: "system", content: "You are helpful." }])
      expect(result).toBe("[system] You are helpful.")
    })
  })

  describe("generateBaselinePromptText", () => {
    it("produces a prompt containing the issue name and description", () => {
      const prompt = generateBaselinePromptText("Secret leakage", "The assistant leaked a secret API key.")
      expect(prompt).toContain("Secret leakage")
      expect(prompt).toContain("The assistant leaked a secret API key.")
    })

    it("includes the conversationText placeholder", () => {
      const prompt = generateBaselinePromptText("Test Issue", "Test description")
      expect(prompt).toContain(EVALUATION_CONVERSATION_TEXT_PLACEHOLDER)
    })

    it("produces a valid script when wrapped", () => {
      const prompt = generateBaselinePromptText("Test Issue", "Test description")
      const script = wrapPromptAsEvaluationScript(prompt)
      expect(validateEvaluationScript(script)).toBe(true)
    })
  })
})
