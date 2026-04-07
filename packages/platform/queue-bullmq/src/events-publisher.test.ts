import type { DomainEvent } from "@domain/events"
import type { PublishOptions, QueueName, QueuePublisherShape, TaskName, TaskPayload } from "@domain/queue"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createEventsPublisher } from "./events.ts"

describe("createEventsPublisher", () => {
  it("adds BullMQ retry options to domain-events dispatch jobs", async () => {
    const publishCalls: Array<{
      readonly queue: QueueName
      readonly task: string
      readonly payload: unknown
      readonly options?: PublishOptions
    }> = []

    const queuePublisher: QueuePublisherShape = {
      publish: <T extends QueueName, K extends TaskName<T>>(
        queue: T,
        task: K,
        payload: TaskPayload<T, K>,
        options?: PublishOptions,
      ) => {
        publishCalls.push(options === undefined ? { queue, task, payload } : { queue, task, payload, options })
        return Effect.void
      },
      close: () => Effect.void,
    }
    const eventsPublisher = createEventsPublisher(queuePublisher)

    const event = {
      name: "OrganizationCreated",
      organizationId: "org-1",
      payload: { organizationId: "org-1", name: "Acme", slug: "acme" },
    } satisfies DomainEvent

    await Effect.runPromise(eventsPublisher.publish(event))

    expect(publishCalls).toHaveLength(1)
    expect(publishCalls[0]?.queue).toBe("domain-events")
    expect(publishCalls[0]?.task).toBe("dispatch")
    expect(publishCalls[0]?.options).toEqual({
      attempts: 8,
      backoff: { type: "exponential", delay: 2000 },
    })
  })
})
