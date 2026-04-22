import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { ProductFeedbackClient } from "../ports/product-feedback-client.ts"
import { createFakeProductFeedbackClient } from "../testing/fake-product-feedback-client.ts"
import { type RecordEnrichmentReviewInput, recordEnrichmentReviewUseCase } from "./record-enrichment-review.ts"

const UPSTREAM_SCORE_ID = "score-xyz789"

const run = async (input: RecordEnrichmentReviewInput) => {
  const fake = createFakeProductFeedbackClient()
  await Effect.runPromise(
    recordEnrichmentReviewUseCase(input).pipe(Effect.provideService(ProductFeedbackClient, fake.client)),
  )
  return fake.writes
}

describe("recordEnrichmentReviewUseCase", () => {
  it("good writes passed=true, value=1, feedback='Good enrichment'", async () => {
    const writes = await run({ upstreamScoreId: UPSTREAM_SCORE_ID, decision: "good" })

    expect(writes).toHaveLength(1)
    expect(writes[0]).toEqual({
      upstreamScoreId: UPSTREAM_SCORE_ID,
      passed: true,
      value: 1,
      feedback: "Good enrichment",
    })
  })

  it("bad writes passed=false, value=0, feedback=reason", async () => {
    const writes = await run({
      upstreamScoreId: UPSTREAM_SCORE_ID,
      decision: "bad",
      comment: "Enrichment changed the meaning of the feedback.",
    })

    expect(writes[0]).toEqual({
      upstreamScoreId: UPSTREAM_SCORE_ID,
      passed: false,
      value: 0,
      feedback: "Enrichment changed the meaning of the feedback.",
    })
  })

  it("bad trims leading/trailing whitespace from the comment", async () => {
    const writes = await run({
      upstreamScoreId: UPSTREAM_SCORE_ID,
      decision: "bad",
      comment: "  Changed the meaning.  ",
    })

    expect(writes[0]?.feedback).toBe("Changed the meaning.")
  })
})
