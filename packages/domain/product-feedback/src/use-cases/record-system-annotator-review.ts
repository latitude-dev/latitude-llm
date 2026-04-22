import { Effect } from "effect"
import { ProductFeedbackClient } from "../ports/product-feedback-client.ts"

/**
 * Input for the System Annotator review flow.
 *
 * Discriminated on `decision` at the type level so a reject without a comment
 * is a compile-time error — the Phase 5 UI forces a reason on reject, and the
 * worker payload is similarly typed.
 */
export type RecordSystemAnnotatorReviewInput = {
  readonly upstreamScoreId: string
} & (
  | { readonly decision: "approve"; readonly comment?: string }
  | { readonly decision: "reject"; readonly comment: string }
)

const APPROVED_FEEDBACK = "Approved"

export const recordSystemAnnotatorReviewUseCase = Effect.fn("productFeedback.recordSystemAnnotatorReview")(function* (
  input: RecordSystemAnnotatorReviewInput,
) {
  yield* Effect.annotateCurrentSpan("productFeedback.flow", "system-annotator-review")
  yield* Effect.annotateCurrentSpan("productFeedback.decision", input.decision)
  yield* Effect.annotateCurrentSpan("productFeedback.upstreamScoreId", input.upstreamScoreId)

  const client = yield* ProductFeedbackClient

  // Trim at the domain boundary — callers (including Phase 5 web routes) are
  // trusted not to send whitespace-only comments, but the type `string` can't
  // enforce that, so normalise once here and never persist leading/trailing
  // whitespace on a dogfood annotation.
  const trimmedComment = input.comment?.trim() ?? ""

  if (input.decision === "approve") {
    return yield* client.writeAnnotation({
      upstreamScoreId: input.upstreamScoreId,
      passed: true,
      value: 1,
      feedback: trimmedComment.length > 0 ? trimmedComment : APPROVED_FEEDBACK,
    })
  }

  return yield* client.writeAnnotation({
    upstreamScoreId: input.upstreamScoreId,
    passed: false,
    value: 0,
    feedback: trimmedComment,
  })
})
