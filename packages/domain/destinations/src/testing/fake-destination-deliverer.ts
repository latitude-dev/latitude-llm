import { Effect } from "effect"
import type { DestinationEvent } from "../entities/destination-event.ts"
import type { DeliveryError } from "../errors.ts"
import type { DeliveryContext, DestinationDeliverer } from "../ports/destination-deliverer.ts"

export interface RecordedDelivery {
  readonly events: readonly DestinationEvent[]
  readonly context: DeliveryContext
}

/**
 * Records every delivery and connection probe; `failWith` makes the next
 * `deliver` / `testConnection` calls fail until cleared, so engine tests can
 * drive retryable/non-retryable branches.
 */
export const createFakeDestinationDeliverer = () => {
  const deliveries: RecordedDelivery[] = []
  let connectionTests = 0
  let failure: DeliveryError | null = null

  const deliverer: DestinationDeliverer = {
    deliver: (events, _config, _credentials, context) =>
      Effect.suspend(() => {
        if (failure) return Effect.fail(failure)
        deliveries.push({ events, context })
        return Effect.succeed({ delivered: events.length, dropped: 0 })
      }),
    testConnection: (_config, _credentials) =>
      Effect.suspend(() => {
        if (failure) return Effect.fail(failure)
        connectionTests += 1
        return Effect.succeed(undefined)
      }),
  }

  return {
    deliverer,
    deliveries,
    get connectionTests() {
      return connectionTests
    },
    failWith: (error: DeliveryError | null) => {
      failure = error
    },
  }
}
