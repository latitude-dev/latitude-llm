import type { EventEnvelope } from "@domain/events"
import { describe, expect, it } from "vitest"
import { mapEnvelopeToMessage } from "./producer.ts"

const makeEnvelope = (overrides?: Partial<EventEnvelope>): EventEnvelope => ({
  id: "evt-123",
  event: {
    name: "user.created",
    organizationId: "org-456",
    payload: { userId: "u-789" },
  },
  occurredAt: new Date("2024-01-01T00:00:00.000Z"),
  ...overrides,
})

describe("mapEnvelopeToMessage", () => {
  it("serializes envelope with nested event structure", () => {
    const envelope = makeEnvelope()
    const message = mapEnvelopeToMessage(envelope)
    const value = JSON.parse(message.value as string)

    expect(value).toEqual({
      id: "evt-123",
      event: {
        name: "user.created",
        organizationId: "org-456",
        payload: { userId: "u-789" },
      },
      occurredAt: "2024-01-01T00:00:00.000Z",
    })
  })

  it("uses organizationId as message key for partition routing", () => {
    const envelope = makeEnvelope()
    const message = mapEnvelopeToMessage(envelope)

    expect(message.key).toBe("org-456")
  })

  it("sets event metadata headers", () => {
    const envelope = makeEnvelope()
    const message = mapEnvelopeToMessage(envelope)

    expect(message.headers).toMatchObject({
      "event-id": "evt-123",
      "event-name": "user.created",
      "organization-id": "org-456",
    })
  })

  it("wire format is parseable by EventEnvelopeSchema", async () => {
    const { EventEnvelopeSchema } = await import("./consumer.ts")
    const envelope = makeEnvelope()
    const message = mapEnvelopeToMessage(envelope)
    const parsed = EventEnvelopeSchema.parse(JSON.parse(message.value as string))

    expect(parsed.id).toBe(envelope.id)
    expect(parsed.event.name).toBe(envelope.event.name)
    expect(parsed.occurredAt).toBeInstanceOf(Date)
    expect(parsed.occurredAt.toISOString()).toBe(envelope.occurredAt.toISOString())
  })
})
