import { Data } from "effect"
import type { DestinationKind } from "./entities/destination.ts"

export class SandboxOrganizationDestinationError extends Data.TaggedError("SandboxOrganizationDestinationError")<{
  readonly organizationId: string
}> {
  readonly httpStatus = 403
  readonly httpMessage = "Sandbox organizations cannot create data destinations"
}

/**
 * Generic, destination-agnostic failure taxonomy the engine branches on (e.g.
 * `rate_limited` backs off instead of quarantining). Deliberately small and
 * vendor-neutral: every adapter maps its own specific failures onto these
 * categories, so a second adapter inherits the engine's policy for free. The
 * adapter-specific detail (`invalid_host_url`, `host_not_https`, …) travels in
 * the error's `detail` field, not here.
 */
export const DELIVERY_ERROR_REASONS = [
  "rate_limited", // throttled — back off, never quarantine
  "server_error", // upstream transient failure (5xx)
  "transport", // could not reach the upstream (network/DNS/connection)
  "auth", // credentials rejected
  "config", // misconfigured; retrying cannot fix (bad host/URL, SSRF block, redirect, mismatch)
] as const

export type DeliveryErrorReason = (typeof DELIVERY_ERROR_REASONS)[number]

const REASON_SET: ReadonlySet<string> = new Set(DELIVERY_ERROR_REASONS)

export const isDeliveryErrorReason = (value: unknown): value is DeliveryErrorReason =>
  typeof value === "string" && REASON_SET.has(value)

/**
 * Reason that means "slow down", not "broken": the destination is healthy and
 * the upstream is throttling us (HTTP 429). A terminal failure with this reason
 * must back off and retry, never count toward quarantine. Destination-agnostic —
 * any adapter that maps a rate-limit response to `rate_limited` inherits the
 * throttle-not-quarantine policy in the engine.
 */
export const isThrottlingDeliveryReason = (reason: DeliveryErrorReason): boolean => reason === "rate_limited"

/**
 * Delivery failed in a way worth retrying (transport, 5xx, 429). `reason` is the
 * generic engine-facing category; `detail` is the adapter's specific, sanitized
 * code (for the stored failure message / UI) — never upstream response bodies
 * (they can echo span payloads back into storage).
 */
export class RetryableDeliveryError extends Data.TaggedError("RetryableDeliveryError")<{
  readonly kind: DestinationKind
  readonly reason: DeliveryErrorReason
  readonly detail?: string
  readonly upstreamStatus?: number
}> {}

/** Delivery failed terminally (401/invalid key, malformed config); retrying cannot succeed. Same `reason`/`detail` split and sanitization rule as {@link RetryableDeliveryError}. */
export class NonRetryableDeliveryError extends Data.TaggedError("NonRetryableDeliveryError")<{
  readonly kind: DestinationKind
  readonly reason: DeliveryErrorReason
  readonly detail?: string
  readonly upstreamStatus?: number
}> {}

export type DeliveryError = RetryableDeliveryError | NonRetryableDeliveryError

export const isRetryableDeliveryError = (error: DeliveryError): error is RetryableDeliveryError =>
  error._tag === "RetryableDeliveryError"
