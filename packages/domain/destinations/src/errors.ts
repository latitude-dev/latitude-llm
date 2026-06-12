import { Data } from "effect"
import type { DestinationKind } from "./entities/destination.ts"

export class SandboxOrganizationDestinationError extends Data.TaggedError("SandboxOrganizationDestinationError")<{
  readonly organizationId: string
}> {
  readonly httpStatus = 403
  readonly httpMessage = "Sandbox organizations cannot create data destinations"
}

/**
 * Delivery failed in a way worth retrying (transport, 5xx, 429). `reason` is
 * sanitized — our own taxonomy plus `upstreamStatus`, never upstream response
 * bodies (they can echo span payloads back into storage).
 */
export class RetryableDeliveryError extends Data.TaggedError("RetryableDeliveryError")<{
  readonly kind: DestinationKind
  readonly reason: string
  readonly upstreamStatus?: number
}> {}

/** Delivery failed terminally (401/invalid key, malformed config); retrying cannot succeed. Same sanitization rule as {@link RetryableDeliveryError}. */
export class NonRetryableDeliveryError extends Data.TaggedError("NonRetryableDeliveryError")<{
  readonly kind: DestinationKind
  readonly reason: string
  readonly upstreamStatus?: number
}> {}

export type DeliveryError = RetryableDeliveryError | NonRetryableDeliveryError

export const isRetryableDeliveryError = (error: DeliveryError): error is RetryableDeliveryError =>
  error._tag === "RetryableDeliveryError"
