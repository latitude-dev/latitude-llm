import type { EventEnvelope, EventsPublisher } from "@domain/events"
import type { QueuePublishError, QueuePublisherShape } from "@domain/queue"
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
    occurredAt: z.iso.datetime().transform((s) => new Date(s)),
  })
  .strict()

// Outbox rows are untyped; the cast bridges storage → typed queue payload.
// Safe because events originate from typed domain code before reaching the outbox.
export const mapEnvelopeToDispatchPayload = (envelope: EventEnvelope) => ({
  id: envelope.id,
  event: envelope.event,
  occurredAt: envelope.occurredAt.toISOString(),
})

export const createEventsPublisher = (queuePublisher: QueuePublisherShape): EventsPublisher<QueuePublishError> => ({
  publish: (envelope: EventEnvelope) =>
    queuePublisher.publish("domain-events", "dispatch", mapEnvelopeToDispatchPayload(envelope)),
})
