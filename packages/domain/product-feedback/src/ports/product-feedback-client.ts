import { Context, type Effect } from "effect"
import type { ProductFeedbackError } from "../errors.ts"

/**
 * Payload a domain use case hands to `ProductFeedbackClient.writeAnnotation`.
 *
 * - `projectSlug` is the dogfood project the target span was exported to. The
 *   `metadata.scoreId` filter only resolves within a single project, so the
 *   write must target the same per-feature project the upstream generation
 *   landed in (e.g. flagger reviews -> `latitude-flaggers`).
 * - `upstreamScoreId` identifies the target LLM telemetry span via the
 *   `metadata.scoreId` filter — see the PRD's "Identity strategy". The adapter
 *   encodes it as `trace.by = "filters"` before calling the Latitude public API.
 * - `passed`, `value`, `feedback` carry the reviewer's signal. Nothing else is
 *   stamped on the outbound annotation — per the PRD (and the current public-API
 *   schema) there is no outbound `metadata` bag.
 */
export interface ProductFeedbackAnnotationInput {
  readonly projectSlug: string
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
