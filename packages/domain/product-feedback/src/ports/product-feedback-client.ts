import { type Effect, Context } from "effect"
import type { ProductFeedbackError } from "../errors.ts"

/**
 * Payload a domain use case hands to `ProductFeedbackClient.writeAnnotation`.
 *
 * - `upstreamScoreId` identifies the target LLM telemetry span via the
 *   `metadata.scoreId` filter — see the PRD's "Identity strategy". The adapter
 *   encodes it as `trace.by = "filters"` before calling the Latitude public API.
 * - `passed`, `value`, `feedback` carry the reviewer's signal. Nothing else is
 *   stamped on the outbound annotation — per the PRD (and the current public-API
 *   schema) there is no outbound `metadata` bag.
 */
export interface ProductFeedbackAnnotationInput {
  readonly upstreamScoreId: string
  readonly passed: boolean
  readonly value: number
  readonly feedback: string
}

export interface ProductFeedbackClientShape {
  writeAnnotation(input: ProductFeedbackAnnotationInput): Effect.Effect<void, ProductFeedbackError>
}

export class ProductFeedbackClient extends Context.Service<ProductFeedbackClient, ProductFeedbackClientShape>()(
  "@domain/product-feedback/ProductFeedbackClient",
) {}
