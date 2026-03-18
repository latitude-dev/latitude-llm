import type { QueueMessage } from "@domain/queue"
import { describe, expect, it } from "vitest"
import { type BullMqJobData, mapJobToQueueMessage, mapQueueMessageToJob } from "./adapter.ts"

const makeQueueMessage = (overrides?: Partial<QueueMessage>): QueueMessage => ({
  body: new TextEncoder().encode('{"test":"data"}'),
  headers: new Map([["content-type", "application/json"]]),
  key: "msg-123",
  ...overrides,
})

describe("mapQueueMessageToJob", () => {
  it("converts QueueMessage to BullMQ job format with headers in data", () => {
    const message = makeQueueMessage()
    const job = mapQueueMessageToJob(message)

    expect(job.name).toBe("default")
    expect(typeof job.data.body).toBe("string")
    expect(job.data.headers).toEqual({ "content-type": "application/json" })
  })

  it("base64 encodes the body inside data", () => {
    const message = makeQueueMessage({ body: new TextEncoder().encode("hello world") })
    const job = mapQueueMessageToJob(message)

    const decoded = atob(job.data.body)
    expect(decoded).toBe("hello world")
  })

  it("converts Map headers to plain object in data", () => {
    const headers = new Map([
      ["event-id", "evt-1"],
      ["event-name", "user.created"],
    ])
    const message = makeQueueMessage({ headers })
    const job = mapQueueMessageToJob(message)

    expect(job.data.headers).toEqual({
      "event-id": "evt-1",
      "event-name": "user.created",
    })
  })
})

describe("mapJobToQueueMessage", () => {
  it("converts BullMQ job to QueueMessage", () => {
    const job = {
      id: "job-456",
      data: { body: btoa("test data"), headers: { "content-type": "application/json" } } satisfies BullMqJobData,
    }
    const message = mapJobToQueueMessage(job)

    expect(message).not.toBeNull()
    expect(message?.key).toBe("job-456")
    expect(new TextDecoder().decode(message?.body)).toBe("test data")
    expect(message?.headers.get("content-type")).toBe("application/json")
  })

  it("returns null for empty body", () => {
    const job = {
      id: "job-456",
      data: { body: "", headers: {} } satisfies BullMqJobData,
    }
    const message = mapJobToQueueMessage(job)

    expect(message).toBeNull()
  })

  it("handles missing headers", () => {
    const job = {
      id: "job-456",
      data: { body: btoa("test"), headers: {} } satisfies BullMqJobData,
    }
    const message = mapJobToQueueMessage(job)

    expect(message).not.toBeNull()
    expect(message?.headers.size).toBe(0)
  })

  it("round-trips through mapQueueMessageToJob", () => {
    const original = makeQueueMessage({
      body: new Uint8Array([1, 2, 3, 255, 128]),
      headers: new Map([["x-custom", "value"]]),
      key: "key-789",
    })
    const job = mapQueueMessageToJob(original)
    const message = mapJobToQueueMessage({
      id: "auto-generated-id",
      data: job.data,
    })

    expect(message).not.toBeNull()
    expect(message?.body).toEqual(original.body)
    expect(message?.headers.get("x-custom")).toBe("value")
  })
})
