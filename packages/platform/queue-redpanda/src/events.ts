import type { EventEnvelope, EventsPublisher } from "@domain/events"
import type { MessageHandler, QueueMessage, QueuePublisher } from "@domain/queue"
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

export const createEventsPublisher = (queuePublisher: QueuePublisher): EventsPublisher => ({
  publish: (envelope: EventEnvelope) =>
    Effect.runPromise(queuePublisher.publish("domain-events", mapEnvelopeToQueueMessage(envelope))),
})

export const createEventHandler = (handler: EventHandler): MessageHandler => ({
  handle: (message: QueueMessage) => {
    const body = new TextDecoder().decode(message.body)
    const parsed = JSON.parse(body)
    const envelope = EventEnvelopeSchema.parse(parsed)
    return handler.handle(envelope)
  },
})
