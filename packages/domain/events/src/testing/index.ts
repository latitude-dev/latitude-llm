import type { DomainEvent, EventPayloads, OutboxWriter } from "../index.js"

/**
 * Creates a mock OutboxWriter that captures all written events.
 * Useful for testing code that writes to the outbox.
 */
export const createMockOutboxWriter = (): OutboxWriter & {
  readonly writtenEvents: Array<{
    readonly id: string | undefined
    readonly eventName: string
    readonly aggregateId: string
    readonly organizationId: string
    readonly payload: unknown
    readonly occurredAt: Date | undefined
  }>
} => {
  const writtenEvents: Array<{
    readonly id: string | undefined
    readonly eventName: string
    readonly aggregateId: string
    readonly organizationId: string
    readonly payload: unknown
    readonly occurredAt: Date | undefined
  }> = []

  return {
    writtenEvents,
    write: async (event) => {
      writtenEvents.push({
        id: event.id,
        eventName: event.eventName,
        aggregateId: event.aggregateId,
        organizationId: event.organizationId,
        payload: event.payload,
        occurredAt: event.occurredAt,
      })
    },
  }
}

/**
 * Creates a test domain event with the given name, organization, and payload.
 * Useful for creating test fixtures.
 */
export const makeTestEvent = <T extends keyof EventPayloads>(
  name: T,
  organizationId: string,
  payload: EventPayloads[T],
): DomainEvent<T, EventPayloads[T]> => ({
  name,
  organizationId,
  payload,
})
