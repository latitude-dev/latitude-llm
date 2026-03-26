import type { EventEnvelope } from "@domain/events"
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
