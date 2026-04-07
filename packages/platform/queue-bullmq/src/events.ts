import type { DomainEvent, EventEnvelope, EventsPublisher } from "@domain/events"
import type { QueuePublishError, QueuePublisherShape } from "@domain/queue"
import { generateId } from "@domain/shared"
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
  publish: (event: DomainEvent) =>
    queuePublisher.publish(
      "domain-events",
      "dispatch",
      {
        id: generateId(),
        event,
        occurredAt: new Date().toISOString(),
      },
      {
        attempts: 8,
        backoff: { type: "exponential", delay: 2000 },
      },
    ),
})
