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
  publish(envelope: EventEnvelope): Effect.Effect<void, TError>
}
