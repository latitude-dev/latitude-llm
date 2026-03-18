import type { EventEnvelope } from "@domain/events"
import { describe, expect, it } from "vitest"
import { EventEnvelopeSchema, mapEnvelopeToQueueMessage } from "./events.ts"

const validWireMessage = {
  id: "evt-123",
  event: {
    name: "user.created",
    organizationId: "org-456",
    payload: { userId: "u-789" },
  },
  occurredAt: "2024-01-01T00:00:00Z",
}

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

describe("EventEnvelopeSchema", () => {
  it("parses a valid message", () => {
    const result = EventEnvelopeSchema.parse(validWireMessage)

    expect(result.id).toBe("evt-123")
    expect(result.event.name).toBe("user.created")
    expect(result.event.organizationId).toBe("org-456")
    expect(result.event.payload).toEqual({ userId: "u-789" })
  })

  it("transforms occurredAt string to Date", () => {
    const result = EventEnvelopeSchema.parse(validWireMessage)

    expect(result.occurredAt).toBeInstanceOf(Date)
    expect(result.occurredAt.toISOString()).toBe("2024-01-01T00:00:00.000Z")
  })

  it("rejects flattened (old BullMQ-style) wire format", () => {
    const flatMessage = {
      id: "evt-123",
      name: "user.created",
      organizationId: "org-456",
      payload: {},
      occurredAt: "2024-01-01T00:00:00Z",
    }

    expect(() => EventEnvelopeSchema.parse(flatMessage)).toThrow()
  })

  it("rejects messages missing the event field", () => {
    const { event: _event, ...withoutEvent } = validWireMessage
    expect(() => EventEnvelopeSchema.parse(withoutEvent)).toThrow()
  })

  it("rejects extra top-level fields (strict mode)", () => {
    const withExtra = { ...validWireMessage, unknownField: "value" }
    expect(() => EventEnvelopeSchema.parse(withExtra)).toThrow()
  })

  it("rejects invalid occurredAt format", () => {
    const badDate = { ...validWireMessage, occurredAt: "not-a-date" }
    expect(() => EventEnvelopeSchema.parse(badDate)).toThrow()
  })
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
