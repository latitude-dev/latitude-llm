import { useMutation } from "@tanstack/react-query"
import { submitEnrichmentReview } from "./product-feedback.functions.ts"

interface SubmitEnrichmentReviewInput {
  readonly scoreId: string
  readonly decision: "good" | "bad"
  readonly comment?: string
}

export function useSubmitEnrichmentReview() {
  return useMutation({
    mutationFn: (input: SubmitEnrichmentReviewInput) =>
      submitEnrichmentReview({
        data: {
          scoreId: input.scoreId,
          decision: input.decision,
          ...(input.comment !== undefined ? { comment: input.comment } : {}),
        },
      }),
  })
}
