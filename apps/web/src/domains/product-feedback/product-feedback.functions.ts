import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getQueuePublisher } from "../../server/clients.ts"

const submitEnrichmentReviewInput = z
  .object({
    scoreId: z.string(),
    decision: z.enum(["good", "bad"]),
    comment: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "bad" && (value.comment === undefined || value.comment.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comment"],
        message: "A comment is required when marking an enrichment as bad.",
      })
    }
  })

export const submitEnrichmentReview = createServerFn({ method: "POST" })
  .inputValidator(submitEnrichmentReviewInput)
  .handler(async ({ data }): Promise<{ enqueued: true }> => {
    await requireSession()
    const publisher = await getQueuePublisher()

    const trimmedComment = data.comment?.trim() ?? ""

    await Effect.runPromise(
      publisher.publish("product-feedback", "submitEnrichmentReview", {
        upstreamScoreId: data.scoreId,
        review:
          data.decision === "good"
            ? { decision: "good", comment: trimmedComment }
            : { decision: "bad", comment: trimmedComment },
      }),
    )

    return { enqueued: true }
  })
