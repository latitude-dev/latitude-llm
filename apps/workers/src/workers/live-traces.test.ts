import { createFakeEventsPublisher } from "@domain/events/testing"
import { describe, expect, it } from "vitest"
import { TestQueueConsumer } from "../testing/index.ts"
import { createLiveTracesWorker } from "./live-traces.ts"

const PAYLOAD = {
  organizationId: "org-live-traces",
  projectId: "proj-live-traces",
  traceId: "trace-live-traces",
} as const

describe("createLiveTracesWorker", () => {
  it("registers the live-traces queue and end task", () => {
    const consumer = new TestQueueConsumer()
    const { publisher } = createFakeEventsPublisher()

    createLiveTracesWorker({ consumer, eventsPublisher: publisher })

    expect(consumer.getRegisteredQueues()).toContain("live-traces")
    expect(consumer.getRegisteredTasks("live-traces")).toContain("end")
  })

  it("publishes TraceEnded when the debounce task wakes up", async () => {
    const consumer = new TestQueueConsumer()
    const { publisher, published } = createFakeEventsPublisher()

    createLiveTracesWorker({ consumer, eventsPublisher: publisher })

    await consumer.dispatchTask("live-traces", "end", PAYLOAD)

    expect(published).toEqual([
      {
        name: "TraceEnded",
        organizationId: PAYLOAD.organizationId,
        payload: PAYLOAD,
      },
    ])
  })
})
