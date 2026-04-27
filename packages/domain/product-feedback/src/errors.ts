import { Data } from "effect"

/**
 * Transient failure writing a product-feedback annotation to the Latitude
 * dogfood project. Covers network drops, timeouts, and 5xx responses from the
 * Latitude public API.
 *
 * The worker lets this propagate so BullMQ's retry policy drives the redelivery.
 */
export class ProductFeedbackTransportError extends Data.TaggedError("ProductFeedbackTransportError")<{
  readonly cause: unknown
}> {}

/**
 * Permanent failure writing a product-feedback annotation: the Latitude API
 * rejected the request (4xx) — malformed payload, unauthenticated key, unknown
 * org/project, etc.
 *
 * The worker logs at `warn` and completes the job because retrying a 4xx body
 * will just produce the same 4xx.
 */
export class ProductFeedbackRequestError extends Data.TaggedError("ProductFeedbackRequestError")<{
  readonly statusCode: number
  readonly message: string
}> {}

export type ProductFeedbackError = ProductFeedbackTransportError | ProductFeedbackRequestError
