import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { ProductFeedbackRequestError, ProductFeedbackTransportError } from "../errors.ts"
import { ProductFeedbackClient } from "../ports/product-feedback-client.ts"
import { createFakeProductFeedbackClient } from "../testing/fake-product-feedback-client.ts"
import {
  type RecordSystemAnnotatorReviewInput,
  recordSystemAnnotatorReviewUseCase,
} from "./record-system-annotator-review.ts"

const UPSTREAM_SCORE_ID = "score-abc123"

const run = async (
  input: RecordSystemAnnotatorReviewInput,
  options?: Parameters<typeof createFakeProductFeedbackClient>[0],
) => {
  const fake = createFakeProductFeedbackClient(options)
  const result = await Effect.runPromise(
    recordSystemAnnotatorReviewUseCase(input).pipe(Effect.provideService(ProductFeedbackClient, fake.client)),
  )
  return { result, writes: fake.writes }
}

describe("recordSystemAnnotatorReviewUseCase", () => {
  it("approve with no comment writes passed=true, value=1, feedback='Approved'", async () => {
    const { writes } = await run({ upstreamScoreId: UPSTREAM_SCORE_ID, decision: "approve" })

    expect(writes).toHaveLength(1)
    expect(writes[0]).toEqual({
      upstreamScoreId: UPSTREAM_SCORE_ID,
      passed: true,
      value: 1,
      feedback: "Approved",
    })
  })

  it("approve with a comment uses the comment as feedback", async () => {
    const { writes } = await run({
      upstreamScoreId: UPSTREAM_SCORE_ID,
      decision: "approve",
      comment: "Looks good; concise.",
    })

    expect(writes[0]?.feedback).toBe("Looks good; concise.")
    expect(writes[0]?.passed).toBe(true)
    expect(writes[0]?.value).toBe(1)
  })

  it("approve with an empty/whitespace comment falls back to 'Approved'", async () => {
    const { writes } = await run({
      upstreamScoreId: UPSTREAM_SCORE_ID,
      decision: "approve",
      comment: "   ",
    })

    // Users clicking Submit with only whitespace should look the same as Skip —
    // we do not want a dogfood annotation whose feedback is literally spaces.
    expect(writes[0]?.feedback).toBe("Approved")
  })

  it("approve trims leading/trailing whitespace from the comment", async () => {
    // The UI doesn't (and shouldn't) trim for us — the domain boundary is the
    // right place to normalise, so leading/trailing whitespace from users who
    // hit Enter mid-textarea never survives into the stored feedback.
    const { writes } = await run({
      upstreamScoreId: UPSTREAM_SCORE_ID,
      decision: "approve",
      comment: "  Looks good.  ",
    })

    expect(writes[0]?.feedback).toBe("Looks good.")
  })

  it("reject trims leading/trailing whitespace from the comment", async () => {
    const { writes } = await run({
      upstreamScoreId: UPSTREAM_SCORE_ID,
      decision: "reject",
      comment: "  Too harsh.\n",
    })

    expect(writes[0]?.feedback).toBe("Too harsh.")
  })

  it("reject writes passed=false, value=0, feedback=reason", async () => {
    const { writes } = await run({
      upstreamScoreId: UPSTREAM_SCORE_ID,
      decision: "reject",
      comment: "Draft was too harsh.",
    })

    expect(writes[0]).toEqual({
      upstreamScoreId: UPSTREAM_SCORE_ID,
      passed: false,
      value: 0,
      feedback: "Draft was too harsh.",
    })
  })

  it("propagates ProductFeedbackTransportError so BullMQ can retry", async () => {
    await expect(
      run(
        { upstreamScoreId: UPSTREAM_SCORE_ID, decision: "approve" },
        { fail: { kind: "transport", cause: new Error("ECONNRESET") } },
      ),
    ).rejects.toMatchObject({ _tag: "ProductFeedbackTransportError" })
  })

  it("propagates ProductFeedbackRequestError so the worker can swallow it", async () => {
    await expect(
      run(
        { upstreamScoreId: UPSTREAM_SCORE_ID, decision: "reject", comment: "nope" },
        { fail: { kind: "request", statusCode: 400, message: "validation failed" } },
      ),
    ).rejects.toMatchObject({ _tag: "ProductFeedbackRequestError", statusCode: 400 })
  })

  it("exports the error types consumers need", () => {
    expect(ProductFeedbackTransportError).toBeDefined()
    expect(ProductFeedbackRequestError).toBeDefined()
  })
})
