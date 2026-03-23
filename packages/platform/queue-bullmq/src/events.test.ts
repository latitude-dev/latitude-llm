import type { EventEnvelope } from "@domain/events"
import { QueuePublishError, type QueuePublisherShape } from "@domain/queue"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  EventEnvelopeSchema,
  mapEnvelopeToQueueMessage,
  publishDomainEvent,
  withDomainEventsQueuePublisher,
} from "./events.ts"

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

describe("publishDomainEvent", () => {
  it("publishes to the domain-events queue with mapped envelope payload", async () => {
    const envelope = makeEnvelope()
    const calls: Array<{ queue: string; body: string }> = []
    const queuePublisher: QueuePublisherShape = {
      publish: (queue, message) =>
        Effect.sync(() => {
          calls.push({
            queue,
            body: new TextDecoder().decode(message.body),
          })
        }),
      close: () => Effect.void,
    }

    await Effect.runPromise(publishDomainEvent({ queuePublisher, envelope }))

    expect(calls).toHaveLength(1)
    expect(calls[0]?.queue).toBe("domain-events")
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      id: envelope.id,
      event: envelope.event,
      occurredAt: envelope.occurredAt.toISOString(),
    })
  })

  it("preserves queue publish failures", async () => {
    const envelope = makeEnvelope()
    const queuePublisher: QueuePublisherShape = {
      publish: () =>
        Effect.fail(
          new QueuePublishError({
            queue: "domain-events",
            cause: new Error("redis unavailable"),
          }),
        ),
      close: () => Effect.void,
    }

    await expect(Effect.runPromise(publishDomainEvent({ queuePublisher, envelope }))).rejects.toMatchObject({
      _tag: "QueuePublishError",
      queue: "domain-events",
    })
  })
})

describe("withDomainEventsQueuePublisher", () => {
  it("adds publishDomainEvent helper while keeping existing publish/close methods", async () => {
    const envelope = makeEnvelope()
    const calls: string[] = []
    const queuePublisher: QueuePublisherShape = {
      publish: (queue) =>
        Effect.sync(() => {
          calls.push(queue)
        }),
      close: () => Effect.sync(() => calls.push("closed")),
    }
    const publisher = withDomainEventsQueuePublisher(queuePublisher)

    await Effect.runPromise(publisher.publishDomainEvent(envelope))
    await Effect.runPromise(publisher.close())

    expect(calls).toEqual(["domain-events", "closed"])
  })
})
