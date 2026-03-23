import type { Effect } from "effect"

export interface DomainEvent<
  TName extends string = string,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly name: TName
  readonly organizationId: string
  readonly payload: TPayload
}

export interface EventEnvelope<TEvent extends DomainEvent = DomainEvent> {
  readonly id: string
  readonly event: TEvent
  readonly occurredAt: Date
}

export interface EventsPublisher<TError = unknown> {
  publish(envelope: EventEnvelope): Effect.Effect<void, TError, never>
}

/**
 * Port for writing domain events to the transactional outbox.
 *
 * Apps use this abstraction instead of inserting into the outbox table directly.
 */
export interface OutboxWriter {
  write(event: {
    readonly id: string
    readonly eventName: string
    readonly aggregateId: string
    readonly organizationId: string
    readonly payload: Record<string, unknown>
    readonly occurredAt: Date
  }): Promise<void>
}
