import type { Queue, Worker } from "bullmq"
import type { Pool } from "pg"
import { describe, expect, it, vi } from "vitest"
import { createWorkersRuntime } from "./runtime.ts"

describe("createWorkersRuntime", () => {
  it("starts outbox consumer when runtime becomes ready", () => {
    const outboxStart = vi.fn()
    const loggerInfo = vi.fn()

    const runtime = createWorkersRuntime({
      eventsQueue: {
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as Queue,
      eventsWorker: {
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as Worker,
      outboxConsumer: {
        start: outboxStart,
        stop: vi.fn().mockResolvedValue(undefined),
      },
      pgPool: {
        end: vi.fn().mockResolvedValue(undefined),
      } as unknown as Pool,
      logger: {
        info: loggerInfo,
      },
    })

    runtime.onReady()

    expect(outboxStart).toHaveBeenCalledTimes(1)
    expect(loggerInfo).toHaveBeenCalledWith("workers ready and outbox consumer started")
  })

  it("stops all runtime resources in shutdown flow", async () => {
    const outboxStop = vi.fn().mockResolvedValue(undefined)
    const queueClose = vi.fn().mockResolvedValue(undefined)
    const workerClose = vi.fn().mockResolvedValue(undefined)
    const poolEnd = vi.fn().mockResolvedValue(undefined)

    const runtime = createWorkersRuntime({
      eventsQueue: {
        close: queueClose,
      } as unknown as Queue,
      eventsWorker: {
        on: vi.fn(),
        close: workerClose,
      } as unknown as Worker,
      outboxConsumer: {
        start: vi.fn(),
        stop: outboxStop,
      },
      pgPool: {
        end: poolEnd,
      } as unknown as Pool,
      logger: {
        info: vi.fn(),
      },
    })

    await runtime.stop()

    expect(outboxStop).toHaveBeenCalledTimes(1)
    expect(poolEnd).toHaveBeenCalledTimes(1)
    expect(queueClose).toHaveBeenCalledTimes(1)
    expect(workerClose).toHaveBeenCalledTimes(1)
  })
})
