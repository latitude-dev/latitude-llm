import { detectScriptCapabilities } from "@domain/sandbox"
import { describe, expect, it } from "vitest"
import { validateEvaluationScript } from "../runtime/evaluation-execution.ts"
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

  it("produces a script that matches the MVP judge template (single-sourced wrapper)", () => {
    const script = compileSettingsToScript({ kind: "judge", criteria: "the response is unhelpful" })
    // Only ${conversation} interpolates; no stray backticks — the same shape as a discovered judge.
    expect(validateEvaluationScript(script)).toBe(true)
  })
})
