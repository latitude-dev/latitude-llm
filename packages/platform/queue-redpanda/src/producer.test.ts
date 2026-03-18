import type { EventEnvelope } from "@domain/events"
import { describe, expect, it } from "vitest"
import { EventEnvelopeSchema, mapEnvelopeToQueueMessage } from "./events.ts"

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

describe("mapEnvelopeToQueueMessage", () => {
  it("serializes envelope with nested event structure", () => {
    const envelope = makeEnvelope()
    const message = mapEnvelopeToQueueMessage(envelope)
    const body = JSON.parse(new TextDecoder().decode(message.body))

    expect(body).toEqual({
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
    const message = mapEnvelopeToQueueMessage(envelope)

    expect(message.key).toBe("org-456")
  })

  it("sets event metadata headers", () => {
    const envelope = makeEnvelope()
    const message = mapEnvelopeToQueueMessage(envelope)

    expect(message.headers.get("event-id")).toBe("evt-123")
    expect(message.headers.get("event-name")).toBe("user.created")
    expect(message.headers.get("organization-id")).toBe("org-456")
  })

  it("wire format is parseable by EventEnvelopeSchema", () => {
    const envelope = makeEnvelope()
    const message = mapEnvelopeToQueueMessage(envelope)
    const body = JSON.parse(new TextDecoder().decode(message.body))
    const parsed = EventEnvelopeSchema.parse(body)

    expect(parsed.id).toBe(envelope.id)
    expect(parsed.event.name).toBe(envelope.event.name)
    expect(parsed.occurredAt).toBeInstanceOf(Date)
    expect(parsed.occurredAt.toISOString()).toBe(envelope.occurredAt.toISOString())
  })
})
