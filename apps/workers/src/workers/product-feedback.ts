import {
  ProductFeedbackClient,
  type ProductFeedbackClientShape,
  recordEnrichmentReviewUseCase,
  recordSystemAnnotatorReviewUseCase,
} from "@domain/product-feedback"
import type { QueueConsumer } from "@domain/queue"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"
import { getProductFeedbackClient } from "../clients.ts"

const logger = createLogger("product-feedback")

interface ProductFeedbackDeps {
  readonly consumer: QueueConsumer
  /** Injected in tests; defaults to the memoized workers client. */
  readonly productFeedbackClient?: ProductFeedbackClientShape
}

export const createProductFeedbackWorker = ({ consumer, productFeedbackClient }: ProductFeedbackDeps) => {
  const client = productFeedbackClient ?? getProductFeedbackClient()

  consumer.subscribe("product-feedback", {
    submitSystemAnnotatorReview: (payload) =>
      recordSystemAnnotatorReviewUseCase({
        upstreamScoreId: payload.upstreamScoreId,
        ...payload.review,
      }).pipe(
        Effect.provideService(ProductFeedbackClient, client),
        // 4xx from the Latitude API are permanent: the payload is malformed or
        // the key is wrong. Retrying just produces the same 4xx, so swallow
        // with a warn. 5xx / network errors propagate so BullMQ retries.
        Effect.catchTag("ProductFeedbackRequestError", (error) =>
          Effect.sync(() =>
            logger.warn(
              `product-feedback system-annotator write rejected by Latitude API (HTTP ${error.statusCode}): ${error.message}`,
              {
                upstreamScoreId: payload.upstreamScoreId,
              },
            ),
          ),
        ),
        withTracing,
      ),

    submitEnrichmentReview: (payload) =>
      recordEnrichmentReviewUseCase({
        upstreamScoreId: payload.upstreamScoreId,
        ...payload.review,
      }).pipe(
        Effect.provideService(ProductFeedbackClient, client),
        Effect.catchTag("ProductFeedbackRequestError", (error) =>
          Effect.sync(() =>
            logger.warn(
              `product-feedback enrichment write rejected by Latitude API (HTTP ${error.statusCode}): ${error.message}`,
              {
                upstreamScoreId: payload.upstreamScoreId,
              },
            ),
          ),
        ),
        withTracing,
      ),
  })
}
