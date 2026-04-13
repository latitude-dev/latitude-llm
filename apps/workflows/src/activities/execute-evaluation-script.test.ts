import {
  EVALUATION_CONVERSATION_PLACEHOLDER,
  extractPromptFromEvaluationScript,
  formatEvaluationConversationForPrompt,
  generateBaselinePromptText,
  validateEvaluationScript,
  wrapPromptAsEvaluationScript,
} from "@domain/evaluations"
import { describe, expect, it } from "vitest"

const DUMMY_CONVERSATION = [
  { role: "user", content: "What is my API key?" },
  { role: "assistant", content: "Your API key is sk-live-123." },
]

describe("MVP script template helpers", () => {
  describe("wrapPromptAsEvaluationScript / extractPromptFromEvaluationScript", () => {
    it("round-trips a simple prompt", () => {
      const prompt = "Evaluate the conversation for issues."
      const script = wrapPromptAsEvaluationScript(prompt)
      const extracted = extractPromptFromEvaluationScript(script)
      expect(extracted).toBe(prompt)
    })

    it("round-trips a prompt with conversation placeholder", () => {
      const prompt = `Analyze this conversation:\n${EVALUATION_CONVERSATION_PLACEHOLDER}\n\nDoes it contain issues?`
      const script = wrapPromptAsEvaluationScript(prompt)
      const extracted = extractPromptFromEvaluationScript(script)
      expect(extracted).toBe(prompt)
    })

    it("returns null for a script that does not match the template", () => {
      const result = extractPromptFromEvaluationScript("return Passed(1, 'looks good')")
      expect(result).toBeNull()
    })

    it("returns null for an empty string", () => {
      expect(extractPromptFromEvaluationScript("")).toBeNull()
    })

    it("returns null for a partial template match", () => {
      const script = wrapPromptAsEvaluationScript("hello")
      const mangled = script.slice(0, script.length - 5)
      expect(extractPromptFromEvaluationScript(mangled)).toBeNull()
    })
  })

  describe("validateEvaluationScript", () => {
    it("accepts a valid template with conversation placeholder", () => {
      const script = wrapPromptAsEvaluationScript(`Check this: ${EVALUATION_CONVERSATION_PLACEHOLDER}`)
      expect(validateEvaluationScript(script)).toBe(true)
    })

    it("accepts a valid template without any interpolation (static prompt)", () => {
      const script = wrapPromptAsEvaluationScript("Is the response helpful?")
      expect(validateEvaluationScript(script)).toBe(true)
    })

    it("rejects a script that does not match the template", () => {
      expect(validateEvaluationScript("return Failed(0, 'bad')")).toBe(false)
    })

    it("rejects a prompt containing forbidden interpolations", () => {
      const forbidden = ["Issue: ${", "issue.name}"].join("")
      const script = wrapPromptAsEvaluationScript(forbidden)
      expect(validateEvaluationScript(script)).toBe(false)
    })

    it("rejects a prompt containing backticks", () => {
      const script = wrapPromptAsEvaluationScript("Use `code` here")
      expect(validateEvaluationScript(script)).toBe(false)
    })

    it("rejects a prompt with multiple different interpolations", () => {
      const otherPlaceholder = ["${", "other}"].join("")
      const script = wrapPromptAsEvaluationScript(`${EVALUATION_CONVERSATION_PLACEHOLDER} and ${otherPlaceholder}`)
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

    it("includes the conversation placeholder", () => {
      const prompt = generateBaselinePromptText("Test Issue", "Test description")
      expect(prompt).toContain(EVALUATION_CONVERSATION_PLACEHOLDER)
    })

    it("produces a valid script when wrapped", () => {
      const prompt = generateBaselinePromptText("Test Issue", "Test description")
      const script = wrapPromptAsEvaluationScript(prompt)
      expect(validateEvaluationScript(script)).toBe(true)
    })
  })
})
