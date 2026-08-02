import { describe, expect, it } from "vitest"
import { frustrationStrategy } from "./frustration.ts"
import { makeTrace, user } from "./test-helpers.ts"

describe("frustrationStrategy", () => {
  it("requires assistant-directed frustration and rejects bug-status reports in the prompt", () => {
    const systemPrompt = frustrationStrategy.buildSystemPrompt?.(makeTrace([user("hello")]))
    expect(systemPrompt).toBeTruthy()

    expect(systemPrompt).toContain("target of the frustration must be the assistant")
    expect(systemPrompt).toContain("Bug-status / reproduction reports")
    expect(systemPrompt).toContain(
      "161 didn't fix my problem i think, it still happens when opening tool calls",
    )
    expect(systemPrompt).toContain('Do not reframe them as "dissatisfaction with the assistant\'s proposed solution"')
    expect(systemPrompt).toContain("EXTERNAL factors")
    expect(systemPrompt).toContain("user's own code, product UI")
  })

  it("gives the annotation reviewer a bug-status and external-factor rejection clause", () => {
    expect(frustrationStrategy.annotationReviewerGuidance).toContain(
      "Reject when the evidence is only a bug-status / reproduction report",
    )
    expect(frustrationStrategy.annotationReviewerGuidance).toContain(
      "dissatisfaction with the assistant's proposed solution",
    )
    expect(frustrationStrategy.annotationReviewerGuidance).toContain(
      "Reject when the evidence is only dissatisfaction with an external factor",
    )
  })

  it("documents bug-status and external-factor exclusions in annotator instructions", () => {
    expect(frustrationStrategy.annotator?.instructions).toContain("bug-status/reproduction reports")
    expect(frustrationStrategy.annotator?.instructions).toContain("external factors")
    expect(frustrationStrategy.annotator?.instructions).toContain("product/UI")
  })
})
