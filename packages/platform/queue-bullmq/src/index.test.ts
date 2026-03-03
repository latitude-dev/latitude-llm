import type { EventEnvelope } from "@domain/events"
import type { Queue } from "bullmq"
import { describe, expect, it, vi } from "vitest"
import { QueuePublishError, createBullmqEventsPublisher } from "./index.ts"

const createEnvelope = (): EventEnvelope => ({
  id: "evt_123",
  event: {
    name: "workspace.created",
    workspaceId: "ws_123",
    payload: { foo: "bar" },
  },
  occurredAt: new Date("2026-01-01T00:00:00.000Z"),
})

describe("createBullmqEventsPublisher", () => {
  it("publishes events to the configured queue", async () => {
    const queueAdd = vi.fn().mockResolvedValue(undefined)
    const publisher = createBullmqEventsPublisher({
      queue: {
        add: queueAdd,
      } as unknown as Queue,
    })

    const envelope = createEnvelope()
    await publisher.publish(envelope)

    expect(queueAdd).toHaveBeenCalledWith(
      "workspace.created",
      {
        eventId: "evt_123",
        workspaceId: "ws_123",
        payload: { foo: "bar" },
        occurredAt: "2026-01-01T00:00:00.000Z",
      },
      { jobId: "evt_123" },
    )
  })

  it("wraps queue errors as QueuePublishError", async () => {
    const publisher = createBullmqEventsPublisher({
      queue: {
        add: vi.fn().mockRejectedValue(new Error("queue down")),
      } as unknown as Queue,
    })

    await expect(publisher.publish(createEnvelope())).rejects.toBeInstanceOf(QueuePublishError)
  })
})
