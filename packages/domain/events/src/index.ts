import type { Effect } from "effect"

export interface EventPayloads {
  MagicLinkEmailRequested: {
    readonly email: string
    readonly magicLinkUrl: string
    readonly emailFlow: string | null
    readonly organizationId: string
    readonly organizationName: string
    readonly inviterName: string | null
    readonly invitationId: string | null
  }
  UserDeletionRequested: {
    readonly userId: string
  }
  SpanIngested: {
    readonly organizationId: string
    readonly projectId: string
    readonly traceId: string
  }
  TraceEnded: {
    readonly organizationId: string
    readonly projectId: string
    readonly traceId: string
  }
  ScoreFinalized: {
    readonly scoreId: string
    readonly issueId: string
  }
}

export type KnownDomainEvent = {
  [E in keyof EventPayloads]: DomainEvent<E, EventPayloads[E]>
}[keyof EventPayloads]

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
