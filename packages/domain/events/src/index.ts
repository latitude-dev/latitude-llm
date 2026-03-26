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
    readonly organizationId: string
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
  ScoreImmutable: {
    readonly organizationId: string
    readonly projectId: string
    readonly scoreId: string
    readonly issueId: string | null
  }
  OrganizationCreated: {
    readonly organizationId: string
    readonly name: string
    readonly slug: string
  }
}

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
export type OutboxWriter = {
  write<TEventName extends keyof EventPayloads>(event: {
    readonly id?: string
    readonly eventName: TEventName
    readonly aggregateId: string
    readonly organizationId: string
    readonly payload: EventPayloads[TEventName]
    readonly occurredAt?: Date
  }): Promise<void>
}
