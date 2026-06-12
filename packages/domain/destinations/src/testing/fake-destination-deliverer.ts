import { Effect } from "effect"
import type { DestinationEvent } from "../entities/destination-event.ts"
import type { DeliveryError } from "../errors.ts"
import type { DeliveryContext, DestinationDeliverer } from "../ports/destination-deliverer.ts"

export interface RecordedDelivery {
  readonly events: readonly DestinationEvent[]
  readonly context: DeliveryContext
}

/**
 * Records every delivery; `failWith` makes the next `deliver` calls fail until
 * cleared, so engine tests can drive retryable/non-retryable branches.
 */
export const createFakeDestinationDeliverer = () => {
  const deliveries: RecordedDelivery[] = []
  let failure: DeliveryError | null = null

  const deliverer: DestinationDeliverer = {
    deliver: (events, _config, _credentials, context) =>
      Effect.suspend(() => {
        if (failure) return Effect.fail(failure)
        deliveries.push({ events, context })
        return Effect.succeed({ delivered: events.length, dropped: 0 })
      }),
  }

  return {
    deliverer,
    deliveries,
    failWith: (error: DeliveryError | null) => {
      failure = error
    },
  }
}
