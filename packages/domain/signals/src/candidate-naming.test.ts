import { describe, expect, it } from "vitest"
import { buildCandidatePlaceholder, truncateSignalName } from "./candidate-naming.ts"
import { SIGNAL_NAME_MAX_LENGTH } from "./constants.ts"

describe("truncateSignalName", () => {
  it("leaves a name inside the cap untouched", () => {
    expect(truncateSignalName("Read tool fails accessing dataset rows")).toBe("Read tool fails accessing dataset rows")
  })

  it("ellipsizes to exactly the cap", () => {
    const truncated = truncateSignalName("a".repeat(SIGNAL_NAME_MAX_LENGTH + 50))

    expect(truncated).toHaveLength(SIGNAL_NAME_MAX_LENGTH)
    expect(truncated.endsWith("...")).toBe(true)
  })
})

describe("buildCandidatePlaceholder", () => {
  it("names from the first sentence and describes with the whole feedback", () => {
    const feedback =
      "The agent called the same tool with identical arguments. It repeated this four times before giving up."

    expect(buildCandidatePlaceholder(feedback)).toEqual({
      name: "The agent called the same tool with identical arguments",
      description: feedback,
    })
  })

  it("uses the whole feedback when there is no sentence terminator", () => {
    const feedback = "False positive jailbreaking flag on legitimate technical requests"

    expect(buildCandidatePlaceholder(feedback)).toEqual({ name: feedback, description: feedback })
  })

  it("keeps a question mark but drops a trailing period", () => {
    expect(buildCandidatePlaceholder("Why did the retry loop never terminate?").name).toBe(
      "Why did the retry loop never terminate?",
    )
  })

  it("collapses whitespace across both fields", () => {
    expect(buildCandidatePlaceholder("  Tool   call\n\nfailed  ")).toEqual({
      name: "Tool call failed",
      description: "Tool call failed",
    })
  })

  it("ignores an abbreviation that looks like a sentence end", () => {
    // Splitting naively would title this signal "e.g" — shorter than the guard,
    // so the full text is used instead.
    const feedback = "e.g. the model emits a tool call with no arguments at all"

    expect(buildCandidatePlaceholder(feedback).name).toBe(feedback)
  })

  it("caps a long first sentence at the name limit while the description keeps everything", () => {
    const sentence = `${"the model repeats itself ".repeat(20)}here`
    const feedback = `${sentence}. And then it stops.`

    const placeholder = buildCandidatePlaceholder(feedback)

    expect(placeholder.name.length).toBeLessThanOrEqual(SIGNAL_NAME_MAX_LENGTH)
    expect(placeholder.name.endsWith("...")).toBe(true)
    expect(placeholder.description).toBe(feedback)
  })

  it("falls back rather than producing an empty name", () => {
    expect(buildCandidatePlaceholder("   \n  ")).toEqual({
      name: "Unnamed signal",
      description: "Unnamed signal",
    })
  })
})
