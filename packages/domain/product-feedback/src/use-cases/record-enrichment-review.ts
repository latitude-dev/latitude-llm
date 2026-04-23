import { Effect } from "effect"
import { ProductFeedbackClient } from "../ports/product-feedback-client.ts"

/**
 * Input for the Enrichment review flow.
 *
 * 👍 accepts an optional note; 👎 requires a reason and the type enforces it.
 */
export type RecordEnrichmentReviewInput = {
  readonly upstreamScoreId: string
} & ({ readonly decision: "good"; readonly comment?: string } | { readonly decision: "bad"; readonly comment: string })

const GOOD_FEEDBACK = "Good enrichment"

export const recordEnrichmentReviewUseCase = Effect.fn("productFeedback.recordEnrichmentReview")(function* (
  input: RecordEnrichmentReviewInput,
) {
  yield* Effect.annotateCurrentSpan("productFeedback.flow", "enrichment-review")
  yield* Effect.annotateCurrentSpan("productFeedback.decision", input.decision)
  yield* Effect.annotateCurrentSpan("productFeedback.upstreamScoreId", input.upstreamScoreId)

  const client = yield* ProductFeedbackClient

  // See the sibling use case: trim at the domain boundary so whitespace-only
  // comments never reach the outbound payload.
  const trimmedComment = input.comment?.trim() ?? ""

  if (input.decision === "good") {
    return yield* client.writeAnnotation({
      upstreamScoreId: input.upstreamScoreId,
      passed: true,
      value: 1,
      feedback: trimmedComment.length > 0 ? trimmedComment : GOOD_FEEDBACK,
    })
  }

  return yield* client.writeAnnotation({
    upstreamScoreId: input.upstreamScoreId,
    passed: false,
    value: 0,
    feedback: trimmedComment,
  })
})
