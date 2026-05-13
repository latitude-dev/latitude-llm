import { Effect } from "effect"
import type { BillingSpendReservationInput, BillingSpendReservationShape } from "../ports/billing-spend-reservation.ts"

interface PeriodCounter {
  reservedCredits: number
  reservedKeys: Set<string>
}

const buildPeriodKey = (input: Pick<BillingSpendReservationInput, "organizationId" | "periodStart" | "periodEnd">) =>
  `${input.organizationId}:${input.periodStart.toISOString()}:${input.periodEnd.toISOString()}`

/**
 * In-memory fake matching the atomic-reservation contract of the Redis adapter.
 *
 * Mode `"atomic"`: enforces `tryReserve` strictly (refuses when projected reserved
 * credits would exceed the cap). Mirrors the Redis Lua-script behavior.
 *
 * Mode `"always-allow"`: lets every reservation through. Used in tests to demonstrate
 * the pre-reservation overshoot under concurrent fan-out.
 */
export const createFakeBillingSpendReservation = (mode: "atomic" | "always-allow" = "atomic") => {
  const counters = new Map<string, PeriodCounter>()

  const reservation: BillingSpendReservationShape = {
    tryReserve: (input) =>
      Effect.sync(() => {
        if (mode === "always-allow") return true

        const key = buildPeriodKey(input)
        let counter = counters.get(key)
        if (!counter) {
          counter = {
            reservedCredits: input.fallbackConsumedCredits,
            reservedKeys: new Set(),
          }
          counters.set(key, counter)
        }

        if (counter.reservedKeys.has(input.idempotencyKey)) return true

        if (counter.reservedCredits + input.creditsRequested > input.maxAllowedConsumedCredits) {
          return false
        }

        counter.reservedCredits += input.creditsRequested
        counter.reservedKeys.add(input.idempotencyKey)
        return true
      }),
  }

  return { reservation, counters }
}
