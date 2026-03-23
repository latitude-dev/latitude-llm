import type { EventEnvelope, EventsPublisher } from "@domain/events"
import type { MessageHandler, QueueMessage, QueuePublishError, QueuePublisherShape } from "@domain/queue"
import { Effect } from "effect"
import { z } from "zod"

export const DomainEventSchema = z.object({
  name: z.string(),
  organizationId: z.string(),
  payload: z.record(z.string(), z.unknown()),
})

export const EventEnvelopeSchema = z
  .object({
    id: z.string(),
    event: DomainEventSchema,
    occurredAt: z
      .string()
      .datetime()
      .transform((s) => new Date(s)),
  })
  .strict()

export interface EventHandler {
  handle(event: EventEnvelope): Effect.Effect<void, unknown>
}

export const mapEnvelopeToQueueMessage = (envelope: EventEnvelope): QueueMessage => ({
  body: new TextEncoder().encode(
    JSON.stringify({
      id: envelope.id,
      event: {
        name: envelope.event.name,
        organizationId: envelope.event.organizationId,
        payload: envelope.event.payload,
      },
      occurredAt: envelope.occurredAt.toISOString(),
    }),
  ),
  key: envelope.event.organizationId,
  headers: new Map([
    ["event-id", envelope.id],
    ["event-name", envelope.event.name],
    ["organization-id", envelope.event.organizationId],
  ]),
})

export interface DomainEventsQueuePublisher extends QueuePublisherShape {
  readonly publishDomainEvent: (envelope: EventEnvelope) => Effect.Effect<void, QueuePublishError>
}

export const publishDomainEvent = ({
  queuePublisher,
  envelope,
}: {
  readonly queuePublisher: QueuePublisherShape
  readonly envelope: EventEnvelope
}): Effect.Effect<void, QueuePublishError> =>
  queuePublisher.publish("domain-events", mapEnvelopeToQueueMessage(envelope))

export const withDomainEventsQueuePublisher = (queuePublisher: QueuePublisherShape): DomainEventsQueuePublisher => ({
  ...queuePublisher,
  publishDomainEvent: (envelope: EventEnvelope) => publishDomainEvent({ queuePublisher, envelope }),
})

export const createEventsPublisher = (queuePublisher: QueuePublisherShape): EventsPublisher<QueuePublishError> => ({
  publish: (envelope: EventEnvelope) => publishDomainEvent({ queuePublisher, envelope }),
})

export const createEventHandler = (handler: EventHandler): MessageHandler => ({
  handle: (message: QueueMessage) =>
    Effect.gen(function* () {
      const body = new TextDecoder().decode(message.body)
      const envelope = yield* Effect.try({
        try: () => EventEnvelopeSchema.parse(JSON.parse(body)),
        catch: (error) => error,
      }).pipe(
        Effect.tapError((error) => Effect.logError(`Failed to parse domain event envelope: ${error}`)),
        Effect.orElseSucceed(() => null),
      )
      if (!envelope) return
      yield* handler.handle(envelope)
    }),
})
