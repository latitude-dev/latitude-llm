import { describe, expect, it } from "vitest"
import { frustrationStrategy } from "./frustration.ts"
import { makeTrace, user } from "./test-helpers.ts"

describe("frustrationStrategy", () => {
  it("requires assistant-directed frustration and rejects external-factor examples in the prompt", () => {
    const systemPrompt = frustrationStrategy.buildSystemPrompt?.(makeTrace([user("hello")]))
    expect(systemPrompt).toBeTruthy()

    expect(systemPrompt).toContain("target of the frustration must be the assistant")
    expect(systemPrompt).toContain("Lead volume/quality")
    expect(systemPrompt).toContain("this volume is ridiculous")
    expect(systemPrompt).toContain("Google Ads is done")
    expect(systemPrompt).toContain("Do not treat complaints about an external platform")
    expect(systemPrompt).toContain("If the quoted evidence is only about an external factor")
  })

  it("gives the annotation reviewer an external-factor rejection clause", () => {
    expect(frustrationStrategy.annotationReviewerGuidance).toContain(
      "Reject when the evidence is only dissatisfaction with an external factor",
    )
    expect(frustrationStrategy.annotationReviewerGuidance).toContain("lead volume/quality")
    expect(frustrationStrategy.annotationReviewerGuidance).toContain(
      "dissatisfaction with the assistant's recommendations",
    )
  })

  it("documents external-factor exclusions in annotator instructions", () => {
    expect(frustrationStrategy.annotator?.instructions).toContain("external factors")
    expect(frustrationStrategy.annotator?.instructions).toContain("campaigns")
  })
})
