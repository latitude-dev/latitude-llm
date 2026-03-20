import { Effect } from "effect"
import type { EventEnvelope, EventsPublisher } from "../index.ts"

export const createFakeEventsPublisher = <TError = never>(overrides?: Partial<EventsPublisher<TError>>) => {
  const published: EventEnvelope[] = []

  const publisher: EventsPublisher<TError> = {
    publish: (envelope: EventEnvelope) => {
      published.push(envelope)
      return Effect.void
    },
    ...overrides,
  } as EventsPublisher<TError>

  return { publisher, published }
}
