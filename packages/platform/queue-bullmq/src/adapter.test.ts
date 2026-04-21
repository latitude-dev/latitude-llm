import { beforeEach, describe, expect, it, vi } from "vitest"

const queueAdd = vi.fn()
const queueClose = vi.fn()
const queueWaitUntilReady = vi.fn()
const queueConstructor = vi.fn()
const workerConstructor = vi.fn()
const connectionQuit = vi.fn()
const createBullMqRedisConnection = vi.fn()

vi.mock("bullmq", () => ({
  Queue: queueConstructor,
  Worker: workerConstructor,
}))

vi.mock("./connection.ts", () => ({
  createBullMqRedisConnection,
}))

describe("createBullMqQueuePublisher", () => {
  beforeEach(() => {
    queueAdd.mockReset()
    queueClose.mockReset()
    queueWaitUntilReady.mockReset()
    queueConstructor.mockReset()
    workerConstructor.mockReset()
    connectionQuit.mockReset()
    createBullMqRedisConnection.mockReset()

    queueConstructor.mockImplementation(function (this: Record<string, unknown>) {
      this.add = queueAdd
      this.close = queueClose
      this.waitUntilReady = queueWaitUntilReady
    })

    createBullMqRedisConnection.mockReturnValue({
      quit: connectionQuit,
    })

    queueAdd.mockResolvedValue(undefined)
    queueClose.mockResolvedValue(undefined)
    queueWaitUntilReady.mockResolvedValue(undefined)
    connectionQuit.mockResolvedValue(undefined)
  })

  it("waits for the queue connection before publishing the first job", async () => {
    const { Effect } = await import("effect")
    const { createBullMqQueuePublisher } = await import("./adapter.ts")
    let ready = false

    queueWaitUntilReady.mockImplementation(async () => {
      ready = true
    })
    queueAdd.mockImplementation(async () => {
      expect(ready).toBe(true)
    })

    const publisher = await Effect.runPromise(
      createBullMqQueuePublisher({
        redis: {
          host: "localhost",
          port: 6379,
        },
      }),
    )

    await Effect.runPromise(
      publisher.publish("exports", "generate", {
        kind: "dataset",
        organizationId: "org-1",
        projectId: "project-1",
        datasetId: "dataset-1",
        recipientEmail: "test@example.com",
        selection: { mode: "all" },
      }),
    )

    expect(queueConstructor).toHaveBeenCalledTimes(1)
    expect(queueWaitUntilReady).toHaveBeenCalledTimes(1)
    expect(queueAdd).toHaveBeenCalledTimes(1)
  })
})
