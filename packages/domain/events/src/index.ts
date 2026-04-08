import type { RepositoryError } from "@domain/shared"
import type { Effect } from "effect"

export interface EventPayloads {
  MagicLinkEmailRequested: {
    readonly email: string
    readonly magicLinkUrl: string
    readonly emailFlow: string | null
    readonly organizationId: string
  }
  InvitationEmailRequested: {
    readonly email: string
    readonly invitationUrl: string
    readonly organizationId: string
    readonly organizationName: string
    readonly inviterName: string
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
  IssueDiscoveryRequested: {
    readonly organizationId: string
    readonly projectId: string
    readonly scoreId: string
  }
  IssueRefreshRequested: {
    readonly organizationId: string
    readonly projectId: string
    readonly issueId: string
  }
  OrganizationCreated: {
    readonly organizationId: string
    readonly name: string
    readonly slug: string
  }
  ProjectCreated: {
    readonly organizationId: string
    readonly projectId: string
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
  publish(envelope: DomainEvent): Effect.Effect<void, TError, never>
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
    readonly aggregateType: string
    readonly aggregateId: string
    readonly organizationId: string
    readonly payload: EventPayloads[TEventName]
    readonly occurredAt?: Date
  }): Effect.Effect<void, RepositoryError>
}
