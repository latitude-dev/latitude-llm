import { Effect } from "effect"
import type { DomainEvent, EventsPublisher } from "../index.ts"

export const createFakeEventsPublisher = <TError = never>(overrides?: Partial<EventsPublisher<TError>>) => {
  const published: DomainEvent[] = []

  const publisher: EventsPublisher<TError> = {
    publish: (event: DomainEvent) => {
      published.push(event)
      return Effect.void
    },
    ...overrides,
  } as EventsPublisher<TError>

  return { publisher, published }
}
