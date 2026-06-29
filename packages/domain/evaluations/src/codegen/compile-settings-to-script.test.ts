import { EVALUATION_CONVERSATION_PLACEHOLDER } from "@domain/evaluations"
import { detectScriptCapabilities } from "@domain/sandbox"
import { describe, expect, it } from "vitest"
import { compileSettingsToScript } from "./compile-settings-to-script.ts"

describe("compileSettingsToScript", () => {
  it("compiles a judge to an llm-capability script on the present-verdict convention", () => {
    const criteria = "the assistant refuses a valid request"
    const script = compileSettingsToScript({ kind: "judge", criteria })

    expect(script).toContain("await llm(")
    expect(script).toContain(criteria)
    expect(script).toContain("set passed to true")
    expect(detectScriptCapabilities(script)).toContain("llm")
  })

  it("uses the single-sourced judge wrapper (one llm() call, present-verdict return, only the conversation placeholder)", () => {
    const script = compileSettingsToScript({ kind: "judge", criteria: "the response is unhelpful" })

    expect(script).toContain("await llm(")
    expect(script).toContain("return Passed(")
    expect(script).toContain("return Failed(")
    expect(script).toContain(EVALUATION_CONVERSATION_PLACEHOLDER)
    // The only `${...}` interpolation in the generated script is the conversation placeholder.
    const interpolations = script.match(/\$\{[^}]+\}/g) ?? []
    expect(interpolations).toEqual([EVALUATION_CONVERSATION_PLACEHOLDER])
  })

  it("interpolates session.conversation, not the legacy bare conversation global", () => {
    expect(EVALUATION_CONVERSATION_PLACEHOLDER).toBe("${session.conversation}")
    const script = compileSettingsToScript({ kind: "judge", criteria: "x" })
    expect(script).toContain("${session.conversation}")
    expect(script).not.toContain("${conversation}")
  })
})
