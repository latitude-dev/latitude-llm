import type { CacheError, OrganizationId } from "@domain/shared"
import { Context, type Effect } from "effect"

export interface BillingSpendReservationInput {
  readonly organizationId: OrganizationId
  readonly periodStart: Date
  readonly periodEnd: Date
  readonly idempotencyKey: string
  readonly creditsRequested: number
  /**
   * Highest value of `consumedCredits` that still keeps projected period spend at or
   * below the configured spending limit. Computed analytically by the use-case from
   * the resolved plan + cap so the adapter stays free of pricing knowledge.
   */
  readonly maxAllowedConsumedCredits: number
  /**
   * Authoritative `consumedCredits` from the latest Postgres snapshot. Used only when
   * the in-memory counter is missing (cold start, key eviction, period rollover) so
   * the counter is initialized to a safe, never-undercounting baseline.
   */
  readonly fallbackConsumedCredits: number
  /** Time-to-live for the reservation key. Should comfortably outlast the billing period. */
  readonly ttlSeconds: number
}

export interface BillingSpendReservationShape {
  /**
   * Atomically increments an in-memory consumed-credits counter for the period iff
   * `current + creditsRequested <= maxAllowedConsumedCredits`. Returns `true` when
   * the reservation succeeded (counter advanced), `false` when refused (counter
   * unchanged).
   *
   * Idempotency: a second call with the same `idempotencyKey` for the same period is
   * a no-op that still returns `true`. This matches the Postgres
   * `billing_usage_events.idempotency_key` semantics so retries of an already-authorized
   * action neither double-reserve nor get rejected.
   */
  tryReserve(input: BillingSpendReservationInput): Effect.Effect<boolean, CacheError>
}

export class BillingSpendReservation extends Context.Service<BillingSpendReservation, BillingSpendReservationShape>()(
  "@domain/billing/BillingSpendReservation",
) {}
